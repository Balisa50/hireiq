"""
HireIQ interviews router.
Handles the full candidate interview lifecycle:
  - Loading job info from interview link token
  - Starting an interview session
  - Saving answers (auto-save)
  - Generating adaptive next questions
  - Submitting the completed interview
  - Triggering AI scoring
  - Company-side candidate management (list, status updates)
"""

import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from app.auth import get_authenticated_company_id, verify_company_owns_resource
from app.database import supabase
from app.models.interview import (
    StartInterviewRequest,
    SaveAnswerRequest,
    GetNextQuestionRequest,
    SubmitInterviewRequest,
    UpdateCandidateStatusRequest,
    InterviewResponse,
    CandidateSummary,
    JobPublicInfo,
)
from app.services.groq_service import generate_adaptive_next_question, score_candidate
from app.services.pdf_service import generate_candidate_report_pdf
import bleach

logger = logging.getLogger("hireiq.interviews_router")
router = APIRouter(prefix="/interviews", tags=["Interviews"])


def _sanitize_answer(text: str) -> str:
    """Strip HTML tags from candidate answers to prevent XSS."""
    return bleach.clean(text, tags=[], strip=True)


# ── Public endpoints (no company auth — for candidates via interview link) ─────

@router.get("/public/job/{link_token}", response_model=JobPublicInfo)
async def get_job_by_link_token(link_token: str) -> JobPublicInfo:
    """
    Load public job information from an interview link token.
    Called by the candidate Welcome screen.
    """
    job_result = (
        supabase.table("jobs")
        .select("*, companies(company_name, logo_url, custom_intro_message)")
        .eq("interview_link_token", link_token)
        .execute()
    )

    if not job_result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview link not found.",
        )

    job = job_result.data[0]

    if job["status"] != "active":
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This interview link is no longer active.",
        )

    company = job.get("companies", {}) or {}

    return JobPublicInfo(
        id=job["id"],
        title=job["title"],
        company_name=company.get("company_name", ""),
        company_logo_url=company.get("logo_url"),
        department=job.get("department"),
        location=job.get("location"),
        employment_type=job.get("employment_type"),
        question_count=job["question_count"],
        custom_intro_message=company.get("custom_intro_message"),
    )


@router.post("/public/start")
async def start_interview_session(
    link_token: str,
    request: StartInterviewRequest,
) -> dict:
    """
    Start a new interview session for a candidate.
    Checks for an existing in-progress session from the same candidate
    so they can resume within 24 hours if they lose connection.
    """
    job_result = (
        supabase.table("jobs")
        .select("id, company_id, status")
        .eq("interview_link_token", link_token)
        .execute()
    )

    if not job_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview link not found.")

    job = job_result.data[0]

    if job["status"] != "active":
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="This interview is no longer active.")

    # Check if candidate already completed this interview
    completed_result = (
        supabase.table("interviews")
        .select("id, status")
        .eq("job_id", job["id"])
        .eq("candidate_email", request.candidate_email.lower())
        .in_("status", ["completed", "scored", "shortlisted", "rejected"])
        .execute()
    )

    if completed_result.data:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already submitted your interview for this position.",
        )

    # Check for an existing in-progress session to resume (within 24 hours)
    from datetime import timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    resume_result = (
        supabase.table("interviews")
        .select("*")
        .eq("job_id", job["id"])
        .eq("candidate_email", request.candidate_email.lower())
        .eq("status", "in_progress")
        .gte("last_saved_at", cutoff)
        .execute()
    )

    if resume_result.data:
        existing = resume_result.data[0]
        return {
            "interview_id": existing["id"],
            "transcript": existing.get("transcript", []),
            "resumed": True,
        }

    # Create a new interview session
    interview_data = {
        "job_id": job["id"],
        "company_id": job["company_id"],
        "candidate_name": bleach.clean(request.candidate_name, tags=[], strip=True),
        "candidate_email": request.candidate_email.lower(),
        "transcript": [],
        "status": "in_progress",
    }

    result = supabase.table("interviews").insert(interview_data).execute()

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Something went wrong starting your interview. Please try again.",
        )

    return {
        "interview_id": result.data[0]["id"],
        "transcript": [],
        "resumed": False,
    }


@router.post("/public/save-answer")
async def auto_save_interview_answer(request: SaveAnswerRequest) -> dict:
    """
    Auto-save a candidate's answer to the database.
    Called every 10 seconds and after each Next Question click.
    Appends the new Q&A pair to the transcript.
    """
    interview_result = (
        supabase.table("interviews")
        .select("transcript, status")
        .eq("id", str(request.interview_id))
        .execute()
    )

    if not interview_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview session not found.")

    interview = interview_result.data[0]

    if interview["status"] not in ("in_progress",):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This interview has already been submitted.",
        )

    transcript = interview.get("transcript") or []

    # Update or append this Q&A entry
    entry = {
        "question_index": request.question_index,
        "question": _sanitize_answer(request.question),
        "answer": _sanitize_answer(request.answer),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    # Replace if index already exists, otherwise append
    existing_indices = {e.get("question_index") for e in transcript}
    if request.question_index in existing_indices:
        transcript = [
            entry if e.get("question_index") == request.question_index else e
            for e in transcript
        ]
    else:
        transcript.append(entry)

    supabase.table("interviews").update({
        "transcript": transcript,
        "last_saved_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", str(request.interview_id)).execute()

    return {"saved": True}


@router.post("/public/next-question")
async def get_next_adaptive_question(request: GetNextQuestionRequest) -> dict:
    """
    Generate the next adaptive interview question based on the conversation so far.
    Uses Groq to adapt follow-up questions to the candidate's actual answers.
    """
    job_result = (
        supabase.table("jobs")
        .select("title, job_description, companies(company_name)")
        .eq("id", str(request.job_id))
        .execute()
    )

    if not job_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")

    job = job_result.data[0]
    company_name = (job.get("companies") or {}).get("company_name", "the company")

    transcript_dicts = [e.model_dump() for e in request.transcript]

    question = await generate_adaptive_next_question(
        job_title=job["title"],
        company_name=company_name,
        job_description=job["job_description"],
        transcript=transcript_dicts,
        last_answer=request.last_answer,
    )

    if not question:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="We're having trouble generating your next question. Please refresh and try again.",
        )

    return {"question": question.strip()}


@router.post("/public/submit")
async def submit_completed_interview(request: SubmitInterviewRequest) -> dict:
    """
    Submit a completed interview.
    Marks status as 'completed', then triggers async scoring.
    """
    interview_result = (
        supabase.table("interviews")
        .select("*, jobs(title, job_description, focus_areas, companies(company_name))")
        .eq("id", str(request.interview_id))
        .execute()
    )

    if not interview_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found.")

    interview = interview_result.data[0]

    if interview["status"] != "in_progress":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This interview has already been submitted.",
        )

    transcript_dicts = [e.model_dump() for e in request.transcript]

    # Mark as completed
    supabase.table("interviews").update({
        "transcript": transcript_dicts,
        "status": "completed",
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "last_saved_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", str(request.interview_id)).execute()

    # Score the interview
    job = interview.get("jobs", {}) or {}
    company = (job.get("companies") or {})

    assessment = await score_candidate(
        job_title=job.get("title", ""),
        company_name=company.get("company_name", ""),
        job_description=job.get("job_description", ""),
        focus_areas=job.get("focus_areas", []),
        transcript=transcript_dicts,
    )

    if assessment:
        supabase.table("interviews").update({
            "overall_score": assessment.get("overall_score"),
            "score_breakdown": assessment.get("score_breakdown"),
            "executive_summary": assessment.get("executive_summary"),
            "key_strengths": assessment.get("key_strengths"),
            "areas_of_concern": assessment.get("areas_of_concern"),
            "recommended_follow_up_questions": assessment.get("recommended_follow_up_questions"),
            "hiring_recommendation": assessment.get("hiring_recommendation"),
            "status": "scored",
        }).eq("id", str(request.interview_id)).execute()

    return {"submitted": True}


# ── Company-authenticated endpoints ───────────────────────────────────────────

@router.get("/", response_model=list[CandidateSummary])
async def list_candidates(
    company_id: str = Depends(get_authenticated_company_id),
    job_id: str | None = None,
    status_filter: str | None = None,
    min_score: int | None = None,
    max_score: int | None = None,
) -> list[CandidateSummary]:
    """
    Return all candidates for the authenticated company.
    Supports filtering by job, status, and score range.
    """
    query = (
        supabase.table("interviews")
        .select("*, jobs(title)")
        .eq("company_id", company_id)
        .order("overall_score", desc=True, nulls_first=False)
    )

    if job_id:
        query = query.eq("job_id", job_id)
    if status_filter:
        query = query.eq("status", status_filter)
    if min_score is not None:
        query = query.gte("overall_score", min_score)
    if max_score is not None:
        query = query.lte("overall_score", max_score)

    result = query.execute()

    summaries = []
    for interview in result.data:
        duration = None
        if interview.get("completed_at") and interview.get("started_at"):
            from datetime import datetime as dt
            try:
                start = dt.fromisoformat(interview["started_at"].replace("Z", "+00:00"))
                end = dt.fromisoformat(interview["completed_at"].replace("Z", "+00:00"))
                duration = max(1, int((end - start).total_seconds() / 60))
            except Exception:
                duration = None

        job_info = interview.get("jobs") or {}
        summaries.append(
            CandidateSummary(
                id=interview["id"],
                candidate_name=interview["candidate_name"],
                candidate_email=interview["candidate_email"],
                job_title=job_info.get("title", "Unknown Role"),
                overall_score=interview.get("overall_score"),
                hiring_recommendation=interview.get("hiring_recommendation"),
                status=interview["status"],
                started_at=interview["started_at"],
                completed_at=interview.get("completed_at"),
                interview_duration_minutes=duration,
            )
        )

    return summaries


@router.get("/{interview_id}", response_model=InterviewResponse)
async def get_interview_report(
    interview_id: str,
    company_id: str = Depends(get_authenticated_company_id),
) -> InterviewResponse:
    """Return the full interview details and AI assessment for a candidate."""
    result = (
        supabase.table("interviews")
        .select("*")
        .eq("id", interview_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found.")

    interview = result.data[0]
    verify_company_owns_resource(interview["company_id"], company_id, "interview")

    return InterviewResponse(**interview)


@router.patch("/{interview_id}/status", response_model=dict)
async def update_candidate_status(
    interview_id: str,
    request: UpdateCandidateStatusRequest,
    company_id: str = Depends(get_authenticated_company_id),
) -> dict:
    """Update a candidate's status — shortlist, reject, etc."""
    result = (
        supabase.table("interviews")
        .select("company_id")
        .eq("id", interview_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found.")

    verify_company_owns_resource(result.data[0]["company_id"], company_id, "interview")

    supabase.table("interviews").update({"status": request.status}).eq("id", interview_id).execute()

    return {"message": f"Candidate status updated to {request.status}."}


@router.get("/{interview_id}/report/pdf")
async def download_candidate_report_pdf(
    interview_id: str,
    company_id: str = Depends(get_authenticated_company_id),
) -> Response:
    """Generate and return a professional PDF candidate report."""
    result = (
        supabase.table("interviews")
        .select("*, jobs(title, companies(company_name))")
        .eq("id", interview_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found.")

    interview = result.data[0]
    verify_company_owns_resource(interview["company_id"], company_id, "interview")

    if interview.get("status") not in ("scored", "shortlisted", "rejected"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Report is not yet available. The interview has not been scored.",
        )

    job = interview.get("jobs") or {}
    company = (job.get("companies") or {})

    try:
        pdf_bytes = generate_candidate_report_pdf(
            candidate_name=interview["candidate_name"],
            candidate_email=interview["candidate_email"],
            job_title=job.get("title", "Unknown Role"),
            company_name=company.get("company_name", ""),
            started_at=datetime.fromisoformat(interview["started_at"].replace("Z", "+00:00")),
            completed_at=(
                datetime.fromisoformat(interview["completed_at"].replace("Z", "+00:00"))
                if interview.get("completed_at")
                else None
            ),
            overall_score=interview.get("overall_score", 0),
            score_breakdown=interview.get("score_breakdown", {}),
            executive_summary=interview.get("executive_summary", ""),
            key_strengths=interview.get("key_strengths", []),
            areas_of_concern=interview.get("areas_of_concern", []),
            recommended_follow_up_questions=interview.get("recommended_follow_up_questions", []),
            hiring_recommendation=interview.get("hiring_recommendation", ""),
            transcript=interview.get("transcript", []),
        )
    except RuntimeError as error:
        logger.error("PDF generation error", extra={"interview_id": interview_id, "error": str(error)})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate PDF report. Please try again.",
        ) from error

    filename = f"HireIQ_Report_{interview['candidate_name'].replace(' ', '_')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
