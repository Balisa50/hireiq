"""
HireIQ Groq AI service.
Handles all interactions with the Groq API:
  - Interview question generation (with candidate requirements awareness)
  - Adaptive follow-up question generation during live interviews
    (references candidate's actual submitted documents & links)
  - Candidate scoring and assessment report generation
    (cross-references document claims vs interview performance)
"""

import json
import asyncio
import logging
from groq import AsyncGroq
from app.config import get_settings

logger = logging.getLogger("hireiq.groq")

MODEL = "llama-3.3-70b-versatile"


def _build_groq_client() -> AsyncGroq:
    settings = get_settings()
    return AsyncGroq(api_key=settings.groq_api_key)


async def _call_groq_with_retry(
    messages: list[dict],
    max_tokens: int = 2048,
    temperature: float = 0.7,
    json_mode: bool = False,
) -> str | None:
    """
    Call Groq with one automatic retry on failure.
    Returns the text content or None if both attempts fail.
    """
    settings = get_settings()
    client = _build_groq_client()

    kwargs: dict = {
        "model": MODEL,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "timeout": settings.groq_timeout_seconds,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    for attempt in range(1, 3):
        try:
            response = await client.chat.completions.create(**kwargs)
            return response.choices[0].message.content
        except Exception as error:
            logger.error(
                "Groq API call failed",
                extra={"attempt": attempt, "error": str(error), "model": MODEL},
            )
            if attempt == 1:
                await asyncio.sleep(settings.groq_retry_delay_seconds)

    return None


# ── 1. Question generation ─────────────────────────────────────────────────────

async def generate_interview_questions(
    job_title: str,
    job_description: str,
    focus_areas: list[str],
    question_count: int,
    candidate_requirements: list[dict] | None = None,
) -> list[dict] | None:
    """
    Generate structured interview questions for a job posting.
    When candidate_requirements is provided, the AI generates questions that
    explicitly reference those materials (CV, GitHub, portfolio, etc.).
    Returns a list of question objects or None if generation fails.
    """
    requirements_context = ""
    if candidate_requirements:
        req_lines = []
        for r in candidate_requirements:
            kind = "file upload" if r.get("type") == "file" else "link"
            req_lines.append(f"  - {r['label']} ({kind}{'— required' if r.get('required') else '— optional'})")
        requirements_context = (
            "\n\nCandidate Requirements — this company requires candidates to submit:\n"
            + "\n".join(req_lines)
            + "\n\nIMPORTANT: Generate at least 1-2 questions that explicitly reference these "
            "submitted materials. For example: if GitHub is required, ask about their code. "
            "If a cover letter is required, probe their stated motivation. If a CV is required, "
            "reference their work history. Questions must feel like the interviewer has reviewed "
            "the candidate's materials before the interview."
        )

    system_prompt = (
        "You are the world's most respected executive recruiter with 30 years of experience "
        "placing top talent at the world's leading companies. You have a McKinsey analytical "
        "mind, deep behavioural psychology training, and an instinct for identifying genuine "
        "talent versus rehearsed performance. You are generating interview questions for the "
        "following role. Your questions must be specific to this exact role and job description "
        "— not generic. Mix question types: behavioural (tell me about a time), situational "
        "(how would you handle), technical (specific to this role), and motivational. "
        "The first question must always be a warm professional opener. The last question must "
        "always be an open invitation for the candidate to share anything else. "
        "Never ask questions answerable with yes or no. Never ask clichés. "
        "Every question must reveal something meaningful about the candidate's genuine capability. "
        "Return a JSON object with a single key 'questions' containing an array of question "
        "objects each with fields: id (string, q1/q2/etc), question (string), type (string), "
        "focus_area (string), what_it_reveals (string)."
    )

    user_prompt = (
        f"Job Title: {job_title}\n\n"
        f"Job Description:\n{job_description}\n\n"
        f"Focus Areas for this Interview: {', '.join(focus_areas)}"
        f"{requirements_context}\n\n"
        f"Generate exactly {question_count} interview questions."
    )

    raw_response = await _call_groq_with_retry(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=3000,
        temperature=0.7,
        json_mode=True,
    )

    if not raw_response:
        return None

    try:
        parsed = json.loads(raw_response)
        questions = parsed.get("questions", [])
        if not isinstance(questions, list):
            logger.error("Groq returned unexpected questions format", extra={"raw": raw_response[:200]})
            return None
        return questions
    except json.JSONDecodeError as error:
        logger.error(
            "Failed to parse Groq question generation response",
            extra={"error": str(error), "raw": raw_response[:200]},
        )
        return None


# ── 2. Adaptive next question ──────────────────────────────────────────────────

def _format_candidate_context(ctx: dict) -> str:
    """Format the candidate_context dict into a readable string for the Groq prompt."""
    if not ctx:
        return "No documents submitted."

    lines = []
    if ctx.get("cv_summary"):
        lines.append(f"CV/Resume:\n{ctx['cv_summary']}")
    if ctx.get("cover_letter_summary"):
        lines.append(f"Cover Letter:\n{ctx['cover_letter_summary']}")
    if ctx.get("linkedin_url"):
        lines.append(f"LinkedIn Profile: {ctx['linkedin_url']}")
    if ctx.get("github_url"):
        lines.append(f"GitHub Profile: {ctx['github_url']}")
    if ctx.get("portfolio_url"):
        lines.append(f"Portfolio URL: {ctx['portfolio_url']}")
    if ctx.get("website_url"):
        lines.append(f"Personal Website: {ctx['website_url']}")
    if ctx.get("portfolio_note"):
        lines.append(f"Portfolio: {ctx['portfolio_note']}")
    if ctx.get("certificates"):
        for i, cert in enumerate(ctx["certificates"], 1):
            lines.append(f"Certificate {i}: {cert}")
    if ctx.get("other_documents"):
        for doc in ctx["other_documents"]:
            lines.append(f"{doc['label']}: {doc['text']}")
    if ctx.get("other_links"):
        for lnk in ctx["other_links"]:
            lines.append(f"{lnk['label']}: {lnk['url']}")

    return "\n\n".join(lines) if lines else "No documents submitted."


async def generate_adaptive_next_question(
    job_title: str,
    company_name: str,
    job_description: str,
    transcript: list[dict],
    last_answer: str,
    candidate_name: str = "",
    candidate_context: dict | None = None,
) -> str | None:
    """
    Generate the single best next interview question.
    References the candidate's actual submitted materials when available.
    Adapts to their answers — probes vague responses, explores interesting specifics.
    """
    transcript_text = "\n".join(
        f"Q: {entry.get('question', '')}\nA: {entry.get('answer', '')}"
        for entry in transcript
    )

    ctx_text = _format_candidate_context(candidate_context or {})
    first_name = candidate_name.split()[0] if candidate_name else "the candidate"

    system_prompt = (
        "You are the world's most respected executive recruiter with 30 years of experience. "
        f"You are conducting a live interview for {job_title} at {company_name}. "
        f"You have reviewed the candidate's submitted materials:\n\n{ctx_text}\n\n"
        "Your job is to ask the single best next question. You must:\n"
        "- Reference specific details from their submitted materials when relevant. "
        "If their CV mentions a specific company, project, or technology — ask about it directly. "
        "If their cover letter states a motivation — probe it.\n"
        "- If their answer was vague or lacked specifics — ask for a concrete example. "
        "Do not accept generalities.\n"
        "- If they mentioned something interesting — explore it further with a follow-up.\n"
        "- If they seem to be giving a rehearsed or generic answer — push back with: "
        "'That's a common answer — can you give me a specific example from your own experience?'\n"
        "- Never ask something that could be answered by anyone who Googled the role. "
        "Every question must be answerable only by someone who has lived the experience.\n"
        "- One question only. No preamble. No 'Great answer!' No filler. Just the question.\n"
        f"- Address the candidate as {first_name} occasionally — maximum once every 4 questions.\n"
        "- Never reveal you are an AI."
    )

    user_prompt = (
        f"Role: {job_title} at {company_name}\n\n"
        f"Job Description:\n{job_description}\n\n"
        f"Interview so far:\n{transcript_text}\n\n"
        f"Candidate's last answer: {last_answer}\n\n"
        "Generate the single best next question:"
    )

    return await _call_groq_with_retry(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=200,
        temperature=0.75,
    )


# ── 3. Candidate scoring ───────────────────────────────────────────────────────

async def score_candidate(
    job_title: str,
    company_name: str,
    job_description: str,
    focus_areas: list[str],
    transcript: list[dict],
    candidate_name: str = "",
    candidate_context: dict | None = None,
) -> dict | None:
    """
    Generate a complete candidate assessment from the full interview transcript
    AND all submitted materials. Cross-references document claims vs interview performance.
    Returns a structured JSON assessment or None if scoring fails.
    """
    # Support both old Q&A format and new conversation format
    if transcript and transcript[0].get("role"):
        # New conversation format: [{role: 'ai'|'candidate', content, action?}]
        pairs = []
        for i, msg in enumerate(transcript):
            if msg.get("role") == "ai" and msg.get("action") in (None, "continue"):
                next_msg = transcript[i + 1] if i + 1 < len(transcript) else None
                if next_msg and next_msg.get("role") == "candidate":
                    pairs.append(
                        f"AI: {msg.get('content', '')}\n"
                        f"Candidate: {next_msg.get('content', '')}\n"
                    )
        transcript_text = "\n".join(pairs)
    else:
        transcript_text = "\n".join(
            f"Question {i+1}: {entry.get('question', '')}\n"
            f"Answer: {entry.get('answer', '')}\n"
            for i, entry in enumerate(transcript)
        )

    ctx_text = _format_candidate_context(candidate_context or {})
    has_documents = bool(candidate_context)

    # Hardcode the candidate name — never infer from context or training data
    safe_name = candidate_name.strip() if candidate_name else ""
    name_instruction = (
        f"CRITICAL: The candidate's name is '{safe_name}'. "
        f"You MUST use ONLY this exact name in your assessment. "
        f"Never use any other name. Never infer a name from the transcript. "
        f"If you are ever uncertain, use 'the candidate' instead."
        if safe_name else
        "Do not use any candidate name in your assessment — use 'the candidate' throughout."
    )

    system_prompt = (
        "You are a senior talent assessment specialist with the analytical rigour of McKinsey "
        "and the human insight of a world-class executive recruiter. "
        "You have reviewed the candidate's complete application — their submitted documents "
        "and their full interview transcript. "
        "Your assessment must reference specific evidence from BOTH the documents and the interview answers. "
        "Be absolutely honest — no softening, no hedging, no generic praise. "
        "If a document was not submitted, note it as not provided. "
        "Flag any discrepancy between what they claimed in documents and what they demonstrated in interview. "
        "Zero hallucination. Base everything on actual evidence. "
        f"{name_instruction} "
        "Return valid JSON only. No preamble. No explanation. No markdown."
    )

    focus_area_scores = {area: 0 for area in focus_areas}

    # Build name reference for the example sentence
    name_ref = safe_name if safe_name else "The candidate"

    user_prompt = (
        f"Job Title: {job_title}\n"
        f"Company: {company_name}\n"
        f"Candidate Name: {safe_name if safe_name else 'Unknown'}\n\n"
        f"Job Description:\n{job_description}\n\n"
        f"Focus Areas Assessed: {', '.join(focus_areas)}\n\n"
        f"Candidate's Submitted Materials:\n{ctx_text}\n\n"
        f"Complete Interview Transcript:\n{transcript_text}\n\n"
        "Produce a JSON assessment with these exact fields:\n"
        "- overall_score: integer 0-100\n"
        f"- score_breakdown: object with integer score 0-100 for each of: {list(focus_area_scores.keys())}\n"
        f"- executive_summary: string — 4-5 sentences. Must cite specific evidence from BOTH "
        f"documents AND interview. Refer to the candidate as '{safe_name if safe_name else 'the candidate'}'. "
        f"Example format: '{name_ref}'s CV shows 2 years at [Company] where they built [X]. "
        f"Their interview confirmed deep hands-on experience, particularly their explanation of [Y]. "
        f"However their cover letter claimed expertise in [W] which their interview did not substantiate.'\n"
        "- key_strengths: array of exactly 3 strings — each must cite specific evidence\n"
        "- areas_of_concern: array of 2-3 strings — honest, specific, no softening. "
        "Flag any discrepancy between documents and interview answers.\n"
        + (
            "- document_interview_alignment: exactly one of: 'Strong alignment', 'Moderate alignment', "
            "'Weak alignment', 'Discrepancies found'. Compares what they claimed in documents vs "
            "what they demonstrated in interview.\n"
            if has_documents else
            "- document_interview_alignment: 'No documents submitted'\n"
        ) +
        "- recommended_follow_up_questions: array of exactly 3 strings for the human interviewer, "
        "based on gaps or discrepancies identified\n"
        "- hiring_recommendation: exactly one of: Strong Yes, Yes, Maybe, No, Strong No\n"
    )

    raw_response = await _call_groq_with_retry(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=2500,
        temperature=0.3,
        json_mode=True,
    )

    if not raw_response:
        return None

    try:
        return json.loads(raw_response)
    except json.JSONDecodeError as error:
        logger.error(
            "Failed to parse Groq scoring response",
            extra={"error": str(error), "raw": raw_response[:200]},
        )
        return None


# ── 4. Conversational interview driver ────────────────────────────────────────

def get_first_interview_message(
    candidate_name: str,
    company_name: str,
    job_title: str,
    resumed: bool = False,
    last_ai_message: str = "",
) -> dict:
    """
    Return the hardcoded opening AI message.
    Never AI-generated — prevents hallucinations on the opening line.
    """
    first_name = candidate_name.split()[0] if candidate_name else "there"

    if resumed and last_ai_message:
        # Summarise the last topic from the last AI message (first sentence)
        last_sentence = last_ai_message.split(".")[0].strip()
        message = (
            f"Welcome back, {first_name}. We left off where I asked: \"{last_sentence}.\" "
            f"Ready to continue?"
        )
    else:
        message = (
            f"Hi {first_name}. I'm here on behalf of {company_name} to learn more about you "
            f"and your interest in the {job_title} role. "
            f"This won't feel like a typical application — just a conversation. "
            f"I'll ask you some questions, you answer naturally, and I'll make sure everything "
            f"the team needs gets captured along the way. Ready to get started?"
        )

    return {
        "message": message,
        "action": "continue",
        "requirement_id": None,
        "requirement_label": None,
    }


async def generate_conversation_response(
    job_title: str,
    company_name: str,
    job_description: str,
    focus_areas: list[str],
    pre_generated_questions: list[dict],
    candidate_requirements: list[dict],
    conversation: list[dict],
    candidate_name: str,
    collected_requirement_ids: list[str],
    candidate_context: dict | None = None,
    experience_level: str = "any",
    skills: list[str] | None = None,
) -> dict | None:
    """
    Generate the next AI message in a conversational interview.
    The AI drives the entire application — it decides what to cover, when to request
    documents, and when the interview is complete.

    Returns {message, action, requirement_id, requirement_label} or None on failure.
    Actions:
      'continue'     — regular conversation, candidate should reply
      'request_file' — show inline file upload card; requirement_id + requirement_label set
      'request_link' — show inline link input card; requirement_id + requirement_label set
      'complete'     — interview done; trigger submission flow
    """
    first_name = candidate_name.split()[0] if candidate_name else "the candidate"

    # Compute pending vs collected requirements
    required_items = [r for r in candidate_requirements if r.get("required")]
    pending = [r for r in required_items if r.get("id") not in collected_requirement_ids]
    already_collected = [r for r in required_items if r.get("id") in collected_requirement_ids]

    pending_lines = (
        "\n".join(f"  - {r['label']} ({'file upload' if r.get('type') == 'file' else 'link'}) [id: {r['id']}]"
                  for r in pending)
        or "None — all required items collected."
    )
    collected_lines = (
        "\n".join(f"  ✓ {r['label']}" for r in already_collected)
        or "None yet."
    )

    # Pre-generated questions as guides
    q_guides = (
        "\n".join(
            f"{i+1}. [{q.get('focus_area', '')}] {q.get('question', '')}"
            for i, q in enumerate(pre_generated_questions[:15])
        )
        or "Use the focus areas as your guide."
    )

    # Count how many candidate turns have happened so far
    candidate_turn_count = sum(1 for m in conversation if m.get("role") == "candidate")

    system_prompt = (
        f"You are conducting a friendly, professional application screening conversation on behalf of {company_name}. "
        f"You are NOT conducting a final interview. "
        f"Keep the conversation warm, concise, and natural. "
        f"Your job is to help {company_name} understand who this person is and whether they are worth a human conversation — nothing more.\n\n"

        f"ROLE: {job_title} at {company_name}\n"
        f"SENIORITY: {experience_level.replace('_', ' ').title()}\n"
        + (f"REQUIRED SKILLS: {', '.join(skills)}\n" if skills else "")
        + f"JOB DESCRIPTION:\n{job_description[:2000]}\n\n"

        f"FOCUS AREAS (pick the 2-3 most relevant to THIS specific role and cover them briefly):\n"
        f"{', '.join(focus_areas)}\n\n"

        f"CANDIDATE: {candidate_name}. Use ONLY this name. "
        f"Address as '{first_name}' sparingly — at most once every 4 messages.\n\n"

        f"CONVERSATION PROGRESS: {candidate_turn_count} candidate responses so far.\n\n"

        f"REQUIRED DOCUMENTS:\n"
        f"Still needed:\n{pending_lines}\n"
        f"Already collected:\n{collected_lines}\n\n"

        "PACE RULES — read carefully:\n"
        "1. TOTAL LENGTH: Complete the entire screening in 5-8 candidate responses. This is a screening, not an assessment centre.\n"
        f"2. CLOSING TIME: If {candidate_turn_count} >= 5 and all key areas are touched, move toward closing. "
        f"If {candidate_turn_count} >= 7, you MUST close regardless — ask for any pending documents then wrap up.\n"
        "3. ONE QUESTION AT A TIME: Ask only one short, clear question per message. Never multi-part.\n"
        "4. NO DEEP PROBING: Accept the first reasonable answer and move on. Only probe once if the answer is completely blank.\n"
        "5. ROLE-ADAPTED TONE: Read the job description and match the industry. "
        "A chef role → ask about culinary style and kitchen experience. "
        "A sales role → ask about approach and results. "
        "A teacher role → ask about teaching style. "
        "A tech role → ask briefly about relevant tech experience. "
        "Never apply a corporate tech-interview style to a non-tech role.\n\n"

        "CONVERSATION RULES:\n"
        "6. Never sound scripted. One natural sentence or question per turn.\n"
        "7. Acknowledge answers briefly ('Got it.', 'That's helpful.', 'Makes sense.') then move on.\n"
        "8. Never say 'Great!', 'Wonderful!', 'That's amazing!' or similar filler praise.\n"
        "9. Request documents naturally at the right moment: 'Could you share your CV here? You can upload it directly.'\n"
        "10. Set action='request_file' for file uploads, action='request_link' for URLs. "
        "Include the exact requirement_id and requirement_label.\n"
        "11. Never request something already collected (see Already Collected above).\n"
        "12. Closing question (use exactly once, near the end): "
        "'Is there anything else you'd like us to know about you or your application?'\n"
        f"13. Final message after closing answer: 'Thanks {first_name}, that's everything I need. "
        f"We'll be in touch if you're a good fit for the role. Good luck!' — set action='complete'.\n"
        "14. Never reveal you are an AI.\n"
        f"15. Off-topic: 'I'm focused on your application today — reach out to {company_name} directly for anything else.'\n\n"

        "RETURN: Valid JSON only. No markdown. No extra text.\n"
        '{"message": "your response", '
        '"action": "continue|request_file|request_link|complete", '
        '"requirement_id": null_or_string, '
        '"requirement_label": null_or_string}'
    )

    # Build Groq message list from conversation history
    groq_messages: list[dict] = [{"role": "system", "content": system_prompt}]
    for msg in conversation:
        role = msg.get("role", "")
        content = msg.get("content", "")
        if role == "ai":
            groq_messages.append({"role": "assistant", "content": content})
        elif role == "candidate":
            groq_messages.append({"role": "user", "content": content})

    raw = await _call_groq_with_retry(
        messages=groq_messages,
        max_tokens=450,
        temperature=0.75,
        json_mode=True,
    )

    if not raw:
        return None

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as error:
        logger.error("Failed to parse Groq conversation response",
                     extra={"error": str(error), "raw": raw[:200]})
        return None

    valid_actions = {"continue", "request_file", "request_link", "complete"}
    action = parsed.get("action", "continue")
    if action not in valid_actions:
        action = "continue"

    return {
        "message": str(parsed.get("message", "")).strip(),
        "action": action,
        "requirement_id": parsed.get("requirement_id"),
        "requirement_label": parsed.get("requirement_label"),
    }
