"""
HireIQ jobs router.
Handles job creation, AI question generation, and job management for companies.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from app.auth import get_authenticated_company_id, verify_company_owns_resource
from app.database import supabase
from app.models.job import (
    CreateJobRequest,
    PublishJobRequest,
    JobResponse,
    JobSummary,
)
from app.services.groq_service import generate_interview_questions

logger = logging.getLogger("hireiq.jobs_router")
router = APIRouter(prefix="/jobs", tags=["Jobs"])


@router.get("/", response_model=list[JobSummary])
async def list_company_jobs(
    company_id: str = Depends(get_authenticated_company_id),
) -> list[JobSummary]:
    """Return all jobs for the authenticated company, with interview counts and average scores."""
    try:
        jobs_result = (
            supabase.table("jobs")
            .select("*")
            .eq("company_id", company_id)
            .order("created_at", desc=True)
            .execute()
        )

        summaries = []
        for job in jobs_result.data:
            interviews_result = (
                supabase.table("interviews")
                .select("overall_score")
                .eq("job_id", job["id"])
                .execute()
            )
            interview_count = len(interviews_result.data)
            scores = [
                r["overall_score"]
                for r in interviews_result.data
                if r.get("overall_score") is not None
            ]
            average_score = round(sum(scores) / len(scores), 1) if scores else None

            summaries.append(
                JobSummary(
                    id=job["id"],
                    title=job["title"],
                    department=job.get("department"),
                    status=job["status"],
                    created_at=job["created_at"],
                    interview_count=interview_count,
                    average_score=average_score,
                    interview_link_token=job["interview_link_token"],
                )
            )

        return summaries

    except Exception as error:
        logger.error("Failed to list jobs", extra={"company_id": company_id, "error": str(error)})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load your jobs. Please try again.",
        ) from error


@router.post("/generate-questions")
async def generate_questions_for_job(
    request: CreateJobRequest,
    company_id: str = Depends(get_authenticated_company_id),
) -> dict:
    """
    Generate AI interview questions for a job description.
    Does NOT save the job — just returns the generated questions for review.
    """
    questions = await generate_interview_questions(
        job_title=request.title,
        job_description=request.job_description,
        focus_areas=request.focus_areas,
        question_count=request.question_count,
    )

    if not questions:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "We're having trouble generating your questions. "
                "Please refresh and try again."
            ),
        )

    return {"questions": questions}


@router.post("/", response_model=JobResponse, status_code=status.HTTP_201_CREATED)
async def publish_job(
    request: PublishJobRequest,
    company_id: str = Depends(get_authenticated_company_id),
) -> JobResponse:
    """
    Save and publish a job with its AI-generated (and optionally edited) questions.
    Returns the job with its unique interview link token.
    """
    try:
        job_data = {
            "company_id": company_id,
            "title": request.title,
            "department": request.department,
            "location": request.location,
            "employment_type": request.employment_type,
            "job_description": request.job_description,
            "question_count": request.question_count,
            "focus_areas": request.focus_areas,
            "questions": [q.model_dump() for q in request.questions],
            "status": "active",
        }

        result = supabase.table("jobs").insert(job_data).execute()

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to publish job. Please try again.",
            )

        job = result.data[0]
        return JobResponse(**job, interview_count=0, average_score=None)

    except HTTPException:
        raise
    except Exception as error:
        logger.error("Failed to publish job", extra={"company_id": company_id, "error": str(error)})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to publish job. Please try again.",
        ) from error


@router.get("/{job_id}", response_model=JobResponse)
async def get_job_detail(
    job_id: str,
    company_id: str = Depends(get_authenticated_company_id),
) -> JobResponse:
    """Return full job details including questions and interview statistics."""
    try:
        result = supabase.table("jobs").select("*").eq("id", job_id).execute()

        if not result.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")

        job = result.data[0]
        verify_company_owns_resource(job["company_id"], company_id, "job")

        interviews_result = (
            supabase.table("interviews")
            .select("overall_score")
            .eq("job_id", job_id)
            .execute()
        )
        interview_count = len(interviews_result.data)
        scores = [r["overall_score"] for r in interviews_result.data if r.get("overall_score")]
        average_score = round(sum(scores) / len(scores), 1) if scores else None

        return JobResponse(**job, interview_count=interview_count, average_score=average_score)

    except HTTPException:
        raise
    except Exception as error:
        logger.error("Failed to get job", extra={"job_id": job_id, "error": str(error)})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load job. Please try again.",
        ) from error


@router.patch("/{job_id}/close", response_model=dict)
async def close_job(
    job_id: str,
    company_id: str = Depends(get_authenticated_company_id),
) -> dict:
    """Close a job so the interview link becomes inactive."""
    result = supabase.table("jobs").select("company_id").eq("id", job_id).execute()
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")

    verify_company_owns_resource(result.data[0]["company_id"], company_id, "job")

    supabase.table("jobs").update({"status": "closed"}).eq("id", job_id).execute()
    return {"message": "Job closed successfully."}


@router.patch("/{job_id}/status", response_model=dict)
async def update_job_status(
    job_id: str,
    payload: dict,
    company_id: str = Depends(get_authenticated_company_id),
) -> dict:
    """Set a job's status to 'active' or 'closed'."""
    new_status = payload.get("status")
    if new_status not in ("active", "closed"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="status must be 'active' or 'closed'.",
        )

    result = supabase.table("jobs").select("company_id").eq("id", job_id).execute()
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")

    verify_company_owns_resource(result.data[0]["company_id"], company_id, "job")

    supabase.table("jobs").update({"status": new_status}).eq("id", job_id).execute()
    return {"status": new_status, "message": f"Job is now {new_status}."}
