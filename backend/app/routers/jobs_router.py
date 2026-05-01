"""
HireIQ jobs router.
Handles job creation, AI question generation, and job management for companies.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from app.auth import get_authenticated_company_id, verify_company_owns_resource
from app.database import supabase
from app.models.job import (
    AIPrefillRequest,
    CreateJobRequest,
    PublishJobRequest,
    JobResponse,
    JobSummary,
)
from app.services.groq_service import generate_interview_questions, generate_job_prefill

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
    Passes candidate_requirements to Groq so it generates questions
    that explicitly reference those submitted materials.
    Does NOT save the job, returns generated questions for review.
    """
    req_dicts = [r.model_dump() for r in request.candidate_requirements]

    questions = await generate_interview_questions(
        job_title=request.title,
        job_description=request.job_description,
        focus_areas=request.focus_areas,
        question_count=request.question_count,
        candidate_requirements=req_dicts if req_dicts else None,
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


@router.post("/ai-prefill")
async def ai_prefill_job(
    request: AIPrefillRequest,
    company_id: str = Depends(get_authenticated_company_id),
) -> dict:
    """
    Given a job title and department, return an AI-generated job posting draft:
    description, required_skills, nice_to_have_skills, eligibility_criteria, and questions.
    Does NOT save anything, purely a generation step for the creation form.
    """
    result = await generate_job_prefill(
        job_title=request.title,
        department=request.department,
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI pre-fill is temporarily unavailable. Please try again or fill the form manually.",
        )

    return result


@router.post("/", response_model=JobResponse, status_code=status.HTTP_201_CREATED)
async def publish_job(
    request: PublishJobRequest,
    company_id: str = Depends(get_authenticated_company_id),
) -> JobResponse:
    """
    Save and publish a job with its AI-generated (and optionally edited) questions.
    Stores candidate_requirements so the interview flow knows what to collect.
    Returns the job with its unique interview link token.
    """
    try:
        job_data = {
            "company_id":             company_id,
            "title":                  request.title,
            "department":             request.department,
            "location":               request.location,
            "employment_type":        request.employment_type,
            "job_description":        request.job_description,
            "question_count":         request.question_count,
            "focus_areas":            request.focus_areas,
            "questions":              [q.model_dump() for q in request.questions],
            "candidate_requirements": [r.model_dump() for r in request.candidate_requirements],
            "status":                 "active",
            # Section 1
            "job_visibility":         request.job_visibility,
            "experience_level":       request.experience_level,
            "work_arrangement":       request.work_arrangement,
            "openings":               request.openings,
            "job_code":               request.job_code,
            "hiring_manager":         request.hiring_manager,
            # Location
            "relocation_considered":  request.relocation_considered,
            "travel_required":        request.travel_required,
            # Compensation
            "skills":                 request.skills,
            "nice_to_have_skills":    request.nice_to_have_skills,
            "salary_min":             request.salary_min,
            "salary_max":             request.salary_max,
            "salary_currency":        request.salary_currency,
            "salary_period":          request.salary_period,
            "salary_disclosed":       request.salary_disclosed,
            "equity_offered":         request.equity_offered,
            "benefits_summary":       request.benefits_summary,
            # Extended config
            "eligibility_criteria":   request.eligibility_criteria,
            "candidate_info_config":  request.candidate_info_config,
            "dei_config":             request.dei_config,
            # AI deterrent
            "ai_deterrent_enabled":   request.ai_deterrent_enabled,
            "ai_deterrent_placement": request.ai_deterrent_placement,
            "ai_deterrent_message":   request.ai_deterrent_message,
            # Job-level controls
            "application_deadline":   request.application_deadline.isoformat() if request.application_deadline else None,
            "application_limit":      request.application_limit,
            "is_paused":              request.is_paused,
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
    """Return full job details including questions, requirements, and interview statistics."""
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


@router.delete("/{job_id}", status_code=status.HTTP_200_OK)
async def delete_job(
    job_id: str,
    company_id: str = Depends(get_authenticated_company_id),
) -> dict:
    """
    Permanently delete a job and all its associated interviews/candidates.
    Only the owning company may delete their own jobs.
    """
    result = supabase.table("jobs").select("company_id").eq("id", job_id).execute()
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")

    verify_company_owns_resource(result.data[0]["company_id"], company_id, "job")

    # Cascade-delete interviews first (FK constraint)
    supabase.table("interviews").delete().eq("job_id", job_id).execute()
    supabase.table("jobs").delete().eq("id", job_id).execute()

    logger.info("Job deleted", extra={"job_id": job_id, "company_id": company_id})
    return {"deleted": True}


@router.patch("/{job_id}/controls", response_model=dict)
async def update_job_controls(
    job_id: str,
    payload: dict,
    company_id: str = Depends(get_authenticated_company_id),
) -> dict:
    """
    Update job-level controls: application_deadline, application_limit, is_paused.
    Only fields included in the payload are updated.
    """
    result = supabase.table("jobs").select("company_id").eq("id", job_id).execute()
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")

    verify_company_owns_resource(result.data[0]["company_id"], company_id, "job")

    allowed = {"application_deadline", "application_limit", "is_paused"}
    update_data = {k: v for k, v in payload.items() if k in allowed}

    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid fields to update.",
        )

    supabase.table("jobs").update(update_data).eq("id", job_id).execute()
    return {"updated": True, **update_data}


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
