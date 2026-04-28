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
import re as _re
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
    GenerateCandidateEmailRequest,
    SendCandidateEmailRequest,
    InterviewResponse,
    CandidateSummary,
    JobPublicInfo,
)
from app.services.groq_service import (
    generate_adaptive_next_question,
    generate_conversation_response,
    get_first_interview_message,
    score_candidate,
    generate_candidate_email,
)
from app.services.pdf_service import generate_candidate_report_pdf
from app.services import file_service
from app.services import github_service
from app.services import email_service
import bleach

logger = logging.getLogger("hireiq.interviews_router")
router = APIRouter(prefix="/interviews", tags=["Interviews"])


def _sanitize_answer(text: str) -> str:
    """Strip HTML tags from candidate answers to prevent XSS."""
    return bleach.clean(text, tags=[], strip=True)


def _check_knockout(
    candidate_message: str,
    conversation: list[dict],
    questions: list[dict],
) -> tuple[bool, str]:
    """
    Evaluate whether the candidate's latest message violates a knockout condition.

    Matches the candidate's answer to the question the AI most recently asked,
    then checks the answer against the knockout threshold (yes/no expected answer,
    number min/max).  Returns (knocked_out, rejection_reason).
    """
    if not questions:
        return False, ""

    msg = candidate_message.lower().strip()

    # Last 4 AI messages — knock-out questions could have been asked recently
    recent_ai_texts = [
        m.get("content", "").lower()
        for m in reversed(conversation)
        if m.get("role") == "ai"
    ][:4]

    if not recent_ai_texts:
        return False, ""

    for q in questions:
        if not q.get("knockout_enabled"):
            continue

        q_text     = q.get("question", "").lower()
        q_words    = [w for w in q_text.split() if len(w) > 4][:6]
        if not q_words:
            continue

        # Check if the AI asked this question recently (>=half of key words match)
        threshold = max(1, len(q_words) // 2)
        was_asked  = any(
            sum(1 for w in q_words if w in ai_txt) >= threshold
            for ai_txt in recent_ai_texts
        )
        if not was_asked:
            continue

        q_type    = q.get("type", "text")
        ko_reason = q.get("knockout_rejection_reason") or "Requirements not met for this role"

        if q_type == "yes_no":
            expected = (q.get("knockout_expected_answer") or "yes").lower()
            positive = bool(_re.search(
                r"\b(yes|yeah|yep|yup|absolutely|correct|i do|i am|i have|definitely|sure|of course)\b",
                msg,
            ))
            negative = bool(_re.search(
                r"\b(no|nope|not\b|don't|do not|doesn't|cannot|can't|i'm not|i am not|never|unfortunately)\b",
                msg,
            ))
            if expected == "yes" and negative and not positive:
                return True, ko_reason
            if expected == "no" and positive and not negative:
                return True, ko_reason

        elif q_type == "number":
            numbers = _re.findall(r"\b(\d+(?:,\d{3})*(?:\.\d+)?)\b", candidate_message)
            if not numbers:
                continue
            value   = float(numbers[0].replace(",", ""))
            min_val = q.get("knockout_min_value")
            max_val = q.get("knockout_max_value")
            if min_val is not None and value < float(min_val):
                return True, ko_reason
            if max_val is not None and value > float(max_val):
                return True, ko_reason

    return False, ""


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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application link not found.")

    job = job_result.data[0]

    if job["status"] != "active":
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This application link is no longer active.",
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
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="This application is no longer active.")

    # Check if candidate already completed this interview
    completed_result = (
        supabase.table("interviews")
        .select("id, status")
        .eq("job_id", job["id"])
        .eq("candidate_email", request.candidate_email.lower())
        .in_("status", ["pending_review", "completed", "scored", "shortlisted", "rejected"])
        .execute()
    )

    if completed_result.data:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already submitted your application for this position.",
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
            detail="Something went wrong starting your application. Please try again.",
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


@router.post("/public/confirm/{interview_id}", response_model=dict)
async def confirm_candidate_submission(interview_id: str) -> dict:
    """
    Candidate explicitly confirms their application after reviewing on the review screen.
    Transitions pending_review → completed → scored.
    Idempotent: if already completed/scored, returns success without re-running scoring.
    """
    iv_result = (
        supabase.table("interviews")
        .select("*, jobs(title, job_description, focus_areas, companies(company_name))")
        .eq("id", interview_id)
        .execute()
    )

    if not iv_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found.")

    interview = iv_result.data[0]
    current_status = interview.get("status", "")

    # Idempotent — already confirmed
    if current_status in ("completed", "scored", "shortlisted", "rejected", "accepted"):
        return {"confirmed": True}

    if current_status != "pending_review":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Interview is not pending review. It may still be in progress.",
        )

    # Mark as completed
    supabase.table("interviews").update({
        "status":        "completed",
        "completed_at":  datetime.now(timezone.utc).isoformat(),
        "last_saved_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", interview_id).execute()

    job               = interview.get("jobs", {}) or {}
    company           = (job.get("companies") or {})
    candidate_context = interview.get("candidate_context") or None
    candidate_name    = interview.get("candidate_name", "")

    assessment = await score_candidate(
        job_title=job.get("title", ""),
        company_name=company.get("company_name", ""),
        job_description=job.get("job_description", ""),
        focus_areas=job.get("focus_areas", []),
        transcript=interview.get("transcript") or [],
        candidate_name=candidate_name,
        candidate_context=candidate_context,
        experience_level=job.get("experience_level", "any"),
        skills=job.get("skills") or [],
    )

    if assessment:
        concerns      = assessment.get("areas_of_concern") or []
        red_flags     = assessment.get("red_flags") or []
        identity_flag = assessment.get("identity_flag")
        if identity_flag:
            red_flags.insert(0, f"IDENTITY: {identity_flag}")
        if red_flags:
            concerns = red_flags + concerns

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
        }).eq("id", interview_id).execute()

    return {"confirmed": True}


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

    # ── Knockout check ────────────────────────────────────────────────────────
    job_questions = job.get("questions") or []
    knocked_out, ko_reason = _check_knockout(
        candidate_message=candidate_msg,
        conversation=updated_conv,
        questions=job_questions,
    )

    if knocked_out:
        rejection_msg = (
            "Thank you for your time. Based on your response, there may be a mismatch "
            "with the requirements for this role. We will keep your details on file but "
            "are unable to progress your application at this stage."
        )
        ko_ai_entry = {
            "role":              "ai",
            "content":           rejection_msg,
            "timestamp":         datetime.now(timezone.utc).isoformat(),
            "action":            "complete",
            "requirement_id":    None,
            "requirement_label": None,
        }
        final_conv = updated_conv + [ko_ai_entry]
        supabase.table("interviews").update({
            "transcript":    final_conv,
            "status":        "auto_rejected",
            "knockout_reason": ko_reason,
            "last_saved_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", str(request.interview_id)).execute()
        logger.info(
            "Knockout triggered for interview %s: %s",
            str(request.interview_id), ko_reason,
        )
        return {
            "message":           rejection_msg,
            "action":            "complete",
            "requirement_id":    None,
            "requirement_label": None,
        }

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
        # Mark as pending_review — candidate reviews before we score.
        # Scoring happens only after the candidate explicitly confirms via /public/confirm/{id}.
        supabase.table("interviews").update({
            "transcript":    final_conv,
            "status":        "pending_review",
            "last_saved_at": datetime.now(timezone.utc).isoformat(),
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


@router.delete("/{interview_id}", response_model=dict)
async def delete_candidate(
    interview_id: str,
    company_id: str = Depends(get_authenticated_company_id),
) -> dict:
    """
    Permanently delete a candidate and all associated data.
    Removes: interview record, transcript, AI scores, uploaded files from Storage.
    This action is irreversible.
    """
    result = (
        supabase.table("interviews")
        .select("company_id, job_id, submitted_files")
        .eq("id", interview_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found.")

    interview = result.data[0]
    verify_company_owns_resource(interview["company_id"], company_id, "interview")

    # Delete all uploaded files from Supabase Storage first
    submitted_files = interview.get("submitted_files") or []
    if submitted_files:
        paths = [f["file_path"] for f in submitted_files if f.get("file_path")]
        if paths:
            try:
                supabase.storage.from_("interview-documents").remove(paths)
                logger.info("Deleted candidate files from storage", extra={"count": len(paths)})
            except Exception as exc:
                # Log but never block record deletion — orphaned files are acceptable
                logger.warning("Failed to delete some files from storage", extra={"error": str(exc)})

    # Delete the interview record (all JSON columns — transcript, scores — go with it)
    supabase.table("interviews").delete().eq("id", interview_id).execute()
    logger.info("Candidate deleted", extra={"interview_id": interview_id, "company_id": company_id})

    return {"deleted": True}


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


@router.post("/{interview_id}/email/generate", response_model=dict)
async def generate_email_draft(
    interview_id: str,
    request: GenerateCandidateEmailRequest,
    company_id: str = Depends(get_authenticated_company_id),
) -> dict:
    """
    Generate an AI-drafted candidate notification email.
    Returns {subject, body}. Does NOT send the email.
    """
    result = (
        supabase.table("interviews")
        .select("company_id, candidate_name, candidate_email, executive_summary, "
                "key_strengths, areas_of_concern, "
                "jobs(title, companies(company_name, contact_email, website))")
        .eq("id", interview_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found.")

    interview = result.data[0]
    verify_company_owns_resource(interview["company_id"], company_id, "interview")

    job     = interview.get("jobs") or {}
    company = job.get("companies") or {}

    draft = await generate_candidate_email(
        status=request.status,
        tone=request.tone,
        candidate_name=interview.get("candidate_name", ""),
        job_title=job.get("title", "this role"),
        company_name=company.get("company_name", ""),
        executive_summary=interview.get("executive_summary") or "",
        key_strengths=interview.get("key_strengths") or [],
        areas_of_concern=interview.get("areas_of_concern") or [],
        company_email=company.get("contact_email") or "",
        company_website=company.get("website") or "",
    )

    if not draft:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Email draft generation failed. Please try again.",
        )

    return draft


@router.post("/{interview_id}/email/send", response_model=dict)
async def send_candidate_email_endpoint(
    interview_id: str,
    request: SendCandidateEmailRequest,
    company_id: str = Depends(get_authenticated_company_id),
) -> dict:
    """
    Send a candidate notification email using the recruiter-approved draft.
    Returns {sent: bool, message: str}.
    """
    result = (
        supabase.table("interviews")
        .select("company_id, candidate_name, candidate_email, jobs(companies(company_name))")
        .eq("id", interview_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found.")

    interview = result.data[0]
    verify_company_owns_resource(interview["company_id"], company_id, "interview")

    job_info     = interview.get("jobs") or {}
    company_info = (job_info.get("companies") or {}) if isinstance(job_info, dict) else {}
    company_name = company_info.get("company_name", "")

    sent = await email_service.send_candidate_email(
        to_email=interview["candidate_email"],
        to_name=interview.get("candidate_name", ""),
        subject=request.subject,
        body=request.body,
        company_name=company_name,
    )

    if not sent:
        return {
            "sent": False,
            "message": "Email not sent. Add your RESEND_API_KEY to the Render environment variables.",
        }

    return {"sent": True, "message": "Email sent successfully."}


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

    if interview.get("status") not in ("scored", "shortlisted", "rejected", "accepted"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Report is not yet available. The application has not been scored yet.",
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
            submitted_files=interview.get("submitted_files", []),
            submitted_links=interview.get("submitted_links", []),
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
