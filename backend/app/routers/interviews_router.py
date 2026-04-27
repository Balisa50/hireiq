"""
HireIQ interviews router.
Handles the full candidate interview lifecycle:
  - Loading job info (including candidate_requirements) from interview link token
  - Starting an interview session
  - Candidate file uploads (validated, stored in Supabase Storage)
  - Candidate link submissions (GitHub, LinkedIn, portfolio, etc.)
  - Saving answers (auto-save)
  - Generating adaptive next questions (referencing submitted materials)
  - Submitting the completed interview
  - Triggering AI scoring (cross-references documents + transcript)
  - Company-side: candidate management, status updates, signed file URLs
"""

import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from fastapi.responses import Response
from app.auth import get_authenticated_company_id, verify_company_owns_resource
from app.database import supabase
from app.models.interview import (
    StartInterviewRequest,
    SaveAnswerRequest,
    GetNextQuestionRequest,
    SubmitInterviewRequest,
    SubmitLinkRequest,
    SendMessageRequest,
    UpdateCandidateStatusRequest,
    InterviewResponse,
    CandidateSummary,
    JobPublicInfo,
)
from app.services.groq_service import (
    generate_adaptive_next_question,
    generate_conversation_response,
    get_first_interview_message,
    score_candidate,
)
from app.services.pdf_service import generate_candidate_report_pdf
from app.services import file_service
from app.services import github_service
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
    Includes candidate_requirements so the interview flow knows what to collect.
    """
    job_result = (
        supabase.table("jobs")
        .select("*, companies(company_name, logo_url, custom_intro_message)")
        .eq("interview_link_token", link_token)
        .execute()
    )

    if not job_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview link not found.")

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
        candidate_requirements=job.get("candidate_requirements") or [],
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
            "submitted_files": existing.get("submitted_files", []),
            "submitted_links": existing.get("submitted_links", []),
            "resumed": True,
        }

    # Create a new interview session
    interview_data = {
        "job_id": job["id"],
        "company_id": job["company_id"],
        "candidate_name": bleach.clean(request.candidate_name, tags=[], strip=True),
        "candidate_email": request.candidate_email.lower(),
        "transcript": [],
        "submitted_files": [],
        "submitted_links": [],
        "candidate_context": {},
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
        "submitted_files": [],
        "submitted_links": [],
        "resumed": False,
    }


@router.post("/public/upload-file")
async def upload_candidate_file(
    interview_id: str = Form(...),
    requirement_id: str = Form(...),
    requirement_label: str = Form(...),
    preset_key: str = Form(default=""),
    file: UploadFile = File(...),
) -> dict:
    """
    Upload a candidate document (CV, certificate, portfolio, etc.).
    Validates type (PDF, DOCX, PNG, JPG, TXT) and size (≤10 MB).
    Extracts text from PDFs and DOCX for AI context.
    Stores in Supabase Storage under interviews/{job_id}/{interview_id}/...
    """
    # Fetch the interview to get job_id
    iv_result = (
        supabase.table("interviews")
        .select("id, job_id, status, submitted_files")
        .eq("id", interview_id)
        .execute()
    )

    if not iv_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview session not found.")

    interview = iv_result.data[0]

    if interview["status"] not in ("in_progress",):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Interview already submitted.")

    file_bytes = await file.read()
    filename   = file.filename or "upload"
    content_type = file.content_type or "application/octet-stream"

    # Validate
    ok, err = file_service.validate_file(file_bytes, filename)
    if not ok:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=err)

    # Upload to Storage
    try:
        path = file_service.upload_file(
            job_id=interview["job_id"],
            interview_id=interview_id,
            requirement_id=requirement_id,
            filename=filename,
            file_bytes=file_bytes,
            content_type=content_type,
        )
    except Exception as exc:
        logger.error("Storage upload failed", extra={"interview_id": interview_id, "error": str(exc)})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Upload failed. Please try again.",
        ) from exc

    # Extract text for AI context
    extracted_text = file_service.extract_text(file_bytes, filename)

    # Build file record
    file_record = {
        "requirement_id":   requirement_id,
        "label":            bleach.clean(requirement_label, tags=[], strip=True),
        "preset_key":       bleach.clean(preset_key, tags=[], strip=True),
        "file_path":        path,
        "file_name":        filename,
        "file_size":        len(file_bytes),
        "extracted_text":   extracted_text,
        "submitted_at":     datetime.now(timezone.utc).isoformat(),
    }

    # Merge with existing submitted_files (replace if same requirement_id)
    existing_files = interview.get("submitted_files") or []
    updated_files  = [f for f in existing_files if f.get("requirement_id") != requirement_id]
    updated_files.append(file_record)

    # Rebuild candidate_context
    iv_links_result = (
        supabase.table("interviews")
        .select("submitted_links, candidate_context")
        .eq("id", interview_id)
        .execute()
    )
    current_links = (iv_links_result.data[0].get("submitted_links") or []) if iv_links_result.data else []
    new_context   = file_service.build_candidate_context(updated_files, current_links)

    supabase.table("interviews").update({
        "submitted_files":   updated_files,
        "candidate_context": new_context,
        "last_saved_at":     datetime.now(timezone.utc).isoformat(),
    }).eq("id", interview_id).execute()

    return {
        "requirement_id": requirement_id,
        "file_name":      filename,
        "file_size":      len(file_bytes),
        "file_path":      path,
    }


@router.post("/public/submit-link")
async def submit_candidate_link(request: SubmitLinkRequest) -> dict:
    """
    Save a URL submitted by the candidate (LinkedIn, GitHub, portfolio, etc.).
    """
    iv_result = (
        supabase.table("interviews")
        .select("id, status, submitted_links, submitted_files, candidate_context")
        .eq("id", str(request.interview_id))
        .execute()
    )

    if not iv_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview session not found.")

    interview = iv_result.data[0]

    if interview["status"] not in ("in_progress",):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Interview already submitted.")

    link_record = {
        "requirement_id":   request.requirement_id,
        "label":            bleach.clean(request.requirement_label, tags=[], strip=True),
        "preset_key":       request.requirement_id,  # preset_key matches requirement_id for presets
        "url":              request.url,
        "submitted_at":     datetime.now(timezone.utc).isoformat(),
    }

    existing_links = interview.get("submitted_links") or []
    updated_links  = [l for l in existing_links if l.get("requirement_id") != request.requirement_id]
    updated_links.append(link_record)

    existing_files = interview.get("submitted_files") or []
    new_context    = file_service.build_candidate_context(existing_files, updated_links)

    # ── GitHub deep analysis ──────────────────────────────────────────────────
    # If the submitted URL is a GitHub link, fetch repo data and embed the
    # analysis into candidate_context so the AI scorer has real evidence.
    url_lower = request.url.lower()
    if "github.com/" in url_lower:
        try:
            gh_data = await github_service.fetch_github_profile(request.url)
            gh_text = github_service.format_github_for_context(gh_data)
            new_context["github_analysis"] = gh_text
            new_context["github_url"]      = request.url
            logger.info("GitHub analysis complete", extra={"username": gh_data.get("username")})
        except Exception as exc:
            logger.warning("GitHub analysis failed silently", extra={"error": str(exc)})
            new_context["github_url"] = request.url

    supabase.table("interviews").update({
        "submitted_links":   updated_links,
        "candidate_context": new_context,
        "last_saved_at":     datetime.now(timezone.utc).isoformat(),
    }).eq("id", str(request.interview_id)).execute()

    return {"saved": True}


@router.post("/public/message")
async def send_interview_message(request: SendMessageRequest) -> dict:
    """
    Conversational interview driver — the new primary interview endpoint.

    On first call (empty candidate_message, no conversation yet):
      Returns the hardcoded greeting — never AI-generated.
    On resume (empty candidate_message, conversation exists):
      Returns the last AI message so the candidate can continue.
    Otherwise:
      Saves the candidate message, generates the next AI response, saves it.
    When action='complete':
      Marks interview completed and triggers AI scoring inline.
    """
    iv_result = (
        supabase.table("interviews")
        .select("*, jobs(title, job_description, focus_areas, questions, candidate_requirements, companies(company_name))")
        .eq("id", str(request.interview_id))
        .execute()
    )

    if not iv_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found.")

    interview = iv_result.data[0]

    if interview["status"] not in ("in_progress",):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Interview already submitted.")

    job          = interview.get("jobs", {}) or {}
    company      = (job.get("companies") or {})
    company_name = company.get("company_name", "the company")
    candidate_name = interview.get("candidate_name", "")
    conversation   = interview.get("transcript") or []

    # ── First message: return hardcoded greeting ──────────────────────────────
    if not conversation:
        first_msg = get_first_interview_message(candidate_name, company_name, job["title"])
        new_conv   = [{
            "role":      "ai",
            "content":   first_msg["message"],
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "action":    "continue",
        }]
        supabase.table("interviews").update({
            "transcript":    new_conv,
            "last_saved_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", str(request.interview_id)).execute()
        return first_msg

    # ── Resume: no new message — return the last AI message ──────────────────
    candidate_msg = request.candidate_message.strip()
    if not candidate_msg:
        last_ai = next((m for m in reversed(conversation) if m.get("role") == "ai"), None)
        if last_ai:
            return {
                "message":           last_ai.get("content", ""),
                "action":            last_ai.get("action", "continue"),
                "requirement_id":    last_ai.get("requirement_id"),
                "requirement_label": last_ai.get("requirement_label"),
            }
        # Shouldn't happen — return first message as fallback
        first_msg = get_first_interview_message(candidate_name, company_name, job["title"])
        return first_msg

    # ── Normal turn: append candidate message + generate AI response ──────────
    candidate_entry = {
        "role":      "candidate",
        "content":   bleach.clean(candidate_msg, tags=[], strip=True),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    updated_conv = conversation + [candidate_entry]

    # Collect what's already been submitted
    submitted_files   = interview.get("submitted_files") or []
    submitted_links   = interview.get("submitted_links") or []
    collected_ids     = (
        [f["requirement_id"] for f in submitted_files]
        + [l["requirement_id"] for l in submitted_links]
    )
    candidate_context = interview.get("candidate_context") or None

    ai_response = await generate_conversation_response(
        job_title=job.get("title", ""),
        company_name=company_name,
        job_description=job.get("job_description", ""),
        focus_areas=job.get("focus_areas", []),
        pre_generated_questions=job.get("questions", []),
        candidate_requirements=job.get("candidate_requirements", []),
        conversation=updated_conv,
        candidate_name=candidate_name,
        collected_requirement_ids=collected_ids,
        candidate_context=candidate_context,
        experience_level=job.get("experience_level", "any"),
        skills=job.get("skills") or [],
    )

    if not ai_response:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI is temporarily unavailable. Please try again.",
        )

    ai_entry = {
        "role":              "ai",
        "content":           ai_response["message"],
        "timestamp":         datetime.now(timezone.utc).isoformat(),
        "action":            ai_response["action"],
        "requirement_id":    ai_response.get("requirement_id"),
        "requirement_label": ai_response.get("requirement_label"),
    }
    final_conv = updated_conv + [ai_entry]

    if ai_response["action"] == "complete":
        # Mark completed and score
        supabase.table("interviews").update({
            "transcript":    final_conv,
            "status":        "completed",
            "completed_at":  datetime.now(timezone.utc).isoformat(),
            "last_saved_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", str(request.interview_id)).execute()

        assessment = await score_candidate(
            job_title=job.get("title", ""),
            company_name=company_name,
            job_description=job.get("job_description", ""),
            focus_areas=job.get("focus_areas", []),
            transcript=final_conv,
            candidate_name=candidate_name,
            candidate_context=candidate_context,
            experience_level=job.get("experience_level", "any"),
            skills=job.get("skills") or [],
        )
        if assessment:
            # Merge red_flags into areas_of_concern so they surface in the UI
            concerns = assessment.get("areas_of_concern") or []
            red_flags = assessment.get("red_flags") or []
            identity_flag = assessment.get("identity_flag")
            if identity_flag:
                red_flags.insert(0, f"IDENTITY: {identity_flag}")
            if red_flags:
                concerns = red_flags + concerns  # red flags first

            supabase.table("interviews").update({
                "overall_score":                   assessment.get("overall_score"),
                "score_breakdown":                 assessment.get("score_breakdown"),
                "executive_summary":               assessment.get("executive_summary"),
                "key_strengths":                   assessment.get("key_strengths"),
                "areas_of_concern":                concerns,
                "recommended_follow_up_questions": assessment.get("recommended_follow_up_questions"),
                "hiring_recommendation":           assessment.get("hiring_recommendation"),
                "document_interview_alignment":    assessment.get("document_interview_alignment"),
                "status":                          "scored",
            }).eq("id", str(request.interview_id)).execute()
    else:
        supabase.table("interviews").update({
            "transcript":    final_conv,
            "last_saved_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", str(request.interview_id)).execute()

    return ai_response


@router.post("/public/save-answer")
async def auto_save_interview_answer(request: SaveAnswerRequest) -> dict:
    """Auto-save a candidate's answer. Appends to transcript JSONB."""
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
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This interview has already been submitted.")

    transcript = interview.get("transcript") or []

    entry = {
        "question_index": request.question_index,
        "question":       _sanitize_answer(request.question),
        "answer":         _sanitize_answer(request.answer),
        "timestamp":      datetime.now(timezone.utc).isoformat(),
    }

    existing_indices = {e.get("question_index") for e in transcript}
    if request.question_index in existing_indices:
        transcript = [
            entry if e.get("question_index") == request.question_index else e
            for e in transcript
        ]
    else:
        transcript.append(entry)

    supabase.table("interviews").update({
        "transcript":    transcript,
        "last_saved_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", str(request.interview_id)).execute()

    return {"saved": True}


@router.post("/public/next-question")
async def get_next_adaptive_question(request: GetNextQuestionRequest) -> dict:
    """
    Generate the next adaptive interview question.
    Fetches candidate_context from the interview record so questions
    reference the candidate's actual submitted documents and links.
    """
    job_result = (
        supabase.table("jobs")
        .select("title, job_description, companies(company_name)")
        .eq("id", str(request.job_id))
        .execute()
    )

    if not job_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")

    job          = job_result.data[0]
    company_name = (job.get("companies") or {}).get("company_name", "the company")

    # Fetch candidate_context and name from interview record
    iv_result = (
        supabase.table("interviews")
        .select("candidate_name, candidate_context")
        .eq("id", str(request.interview_id))
        .execute()
    )
    candidate_name    = ""
    candidate_context = None
    if iv_result.data:
        candidate_name    = iv_result.data[0].get("candidate_name", "")
        candidate_context = iv_result.data[0].get("candidate_context") or None

    transcript_dicts = [e.model_dump() for e in request.transcript]

    question = await generate_adaptive_next_question(
        job_title=job["title"],
        company_name=company_name,
        job_description=job["job_description"],
        transcript=transcript_dicts,
        last_answer=request.last_answer,
        candidate_name=candidate_name,
        candidate_context=candidate_context,
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
    Marks status as 'completed', then triggers async scoring that
    cross-references submitted documents with transcript answers.
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
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This interview has already been submitted.")

    transcript_dicts = [e.model_dump() for e in request.transcript]

    # Mark as completed
    supabase.table("interviews").update({
        "transcript":    transcript_dicts,
        "status":        "completed",
        "completed_at":  datetime.now(timezone.utc).isoformat(),
        "last_saved_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", str(request.interview_id)).execute()

    # Score the interview — pass candidate_name and candidate_context for document cross-referencing
    job               = interview.get("jobs", {}) or {}
    company           = (job.get("companies") or {})
    candidate_context = interview.get("candidate_context") or None
    # Pull name from DB record — NEVER from transcript or AI context
    candidate_name    = interview.get("candidate_name", "")

    assessment = await score_candidate(
        job_title=job.get("title", ""),
        company_name=company.get("company_name", ""),
        job_description=job.get("job_description", ""),
        focus_areas=job.get("focus_areas", []),
        transcript=transcript_dicts,
        candidate_name=candidate_name,
        candidate_context=candidate_context,
    )

    if assessment:
        supabase.table("interviews").update({
            "overall_score":                    assessment.get("overall_score"),
            "score_breakdown":                  assessment.get("score_breakdown"),
            "executive_summary":                assessment.get("executive_summary"),
            "key_strengths":                    assessment.get("key_strengths"),
            "areas_of_concern":                 assessment.get("areas_of_concern"),
            "recommended_follow_up_questions":  assessment.get("recommended_follow_up_questions"),
            "hiring_recommendation":            assessment.get("hiring_recommendation"),
            "document_interview_alignment":     assessment.get("document_interview_alignment"),
            "status":                           "scored",
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
    """Return all candidates for the authenticated company."""
    query = (
        supabase.table("interviews")
        .select("*, jobs(title)")
        .eq("company_id", company_id)
        .order("overall_score", desc=True)
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
                start    = dt.fromisoformat(interview["started_at"].replace("Z", "+00:00"))
                end      = dt.fromisoformat(interview["completed_at"].replace("Z", "+00:00"))
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
    """
    Return the full interview details and AI assessment for a candidate.
    Enriches submitted_files with fresh 7-day signed download URLs.
    """
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

    # Enrich submitted_files with fresh signed URLs for the company to download
    raw_files = interview.get("submitted_files") or []
    enriched_files = file_service.get_signed_urls_for_interview(raw_files)
    interview["submitted_files"] = enriched_files

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

    job     = interview.get("jobs") or {}
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
                if interview.get("completed_at") else None
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
