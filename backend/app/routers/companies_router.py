"""
HireIQ companies router.
Handles company profile management and dashboard statistics.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from app.auth import get_authenticated_company_id
from app.database import supabase
from app.models.company import CompanyProfileUpdateRequest, CompanyResponse
import bleach

logger = logging.getLogger("hireiq.companies_router")
router = APIRouter(prefix="/companies", tags=["Companies"])


def _sanitize_text(text: str | None) -> str | None:
    """Strip all HTML tags from user-provided text to prevent XSS."""
    if text is None:
        return None
    return bleach.clean(text, tags=[], strip=True)


@router.get("/me", response_model=CompanyResponse)
async def get_my_company_profile(
    company_id: str = Depends(get_authenticated_company_id),
) -> CompanyResponse:
    """Return the authenticated company's profile."""
    result = supabase.table("companies").select("*").eq("id", company_id).execute()

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company profile not found.",
        )

    return CompanyResponse(**result.data[0])


@router.patch("/me", response_model=CompanyResponse)
async def update_my_company_profile(
    request: CompanyProfileUpdateRequest,
    company_id: str = Depends(get_authenticated_company_id),
) -> CompanyResponse:
    """Update the authenticated company's profile."""
    update_data = request.model_dump(exclude_none=True)

    # Sanitize all text fields
    for field in ("company_name", "custom_intro_message", "website_url"):
        if field in update_data:
            update_data[field] = _sanitize_text(update_data[field])

    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields provided to update.",
        )

    try:
        result = (
            supabase.table("companies")
            .update(update_data)
            .eq("id", company_id)
            .execute()
        )

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Company profile not found.",
            )

        return CompanyResponse(**result.data[0])

    except HTTPException:
        raise
    except Exception as error:
        logger.error(
            "Failed to update company profile",
            extra={"company_id": company_id, "error": str(error)},
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update profile. Please try again.",
        ) from error


@router.get("/me/dashboard-stats")
async def get_dashboard_statistics(
    company_id: str = Depends(get_authenticated_company_id),
) -> dict:
    """
    Return aggregated statistics for the company dashboard:
    active jobs, total interviews, average score, interviews this week.
    """
    try:
        jobs_result = (
            supabase.table("jobs")
            .select("id, status")
            .eq("company_id", company_id)
            .execute()
        )
        active_jobs = sum(1 for j in jobs_result.data if j["status"] == "active")

        interviews_result = (
            supabase.table("interviews")
            .select("overall_score, started_at, candidate_name, status, job_id")
            .eq("company_id", company_id)
            .order("started_at", desc=True)
            .execute()
        )

        all_interviews = interviews_result.data
        total_interviews = len(all_interviews)

        scores = [r["overall_score"] for r in all_interviews if r.get("overall_score") is not None]
        average_score = round(sum(scores) / len(scores), 1) if scores else None

        # Interviews started in the last 7 days
        from datetime import datetime, timedelta, timezone
        week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        interviews_this_week = sum(
            1 for r in all_interviews
            if r.get("started_at", "") >= week_ago
        )

        # Recent activity feed — last 10 completed interviews
        completed = [
            r for r in all_interviews
            if r.get("status") in ("completed", "scored", "shortlisted", "rejected")
        ][:10]

        # Enrich with job titles
        job_id_to_title: dict[str, str] = {
            j["id"]: j.get("title", "Unknown Role") for j in jobs_result.data
        }
        # Fetch job titles for all jobs if needed
        all_job_ids = list({r.get("job_id") for r in completed if r.get("job_id")})
        if all_job_ids:
            jobs_for_activity = (
                supabase.table("jobs")
                .select("id, title")
                .in_("id", all_job_ids)
                .execute()
            )
            job_id_to_title.update({j["id"]: j["title"] for j in jobs_for_activity.data})

        recent_activity = [
            {
                "candidate_name": r["candidate_name"],
                "job_title": job_id_to_title.get(r.get("job_id", ""), "Unknown Role"),
                "overall_score": r.get("overall_score"),
                "started_at": r.get("started_at"),
                "status": r.get("status"),
            }
            for r in completed
        ]

        return {
            "active_jobs": active_jobs,
            "total_interviews": total_interviews,
            "average_score": average_score,
            "interviews_this_week": interviews_this_week,
            "recent_activity": recent_activity,
        }

    except Exception as error:
        logger.error(
            "Failed to load dashboard stats",
            extra={"company_id": company_id, "error": str(error)},
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load dashboard. Please refresh.",
        ) from error
