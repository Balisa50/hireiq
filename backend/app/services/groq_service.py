"""
HireIQ AI service — powered entirely by Google Gemini Flash 2.0.
Every AI call in the system routes through GEMINI_API_KEY via the Google AI Studio REST API.

Functions:
  1. generate_interview_questions   — structured question generation
  2. generate_adaptive_next_question — single follow-up question
  3. score_candidate                — full assessment with skill gap analysis
  4. generate_candidate_email       — candidate notification email drafts
  5. generate_conversation_response — live interview conversation driver
  6. get_first_interview_message    — hardcoded opening (never AI-generated)
"""

import json
import re
import asyncio
import logging
import httpx
from app.config import get_settings

logger = logging.getLogger("hireiq.groq")

# Gemini Flash 2.0 — stable GA model via v1beta
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"


# ── Shared response parser ─────────────────────────────────────────────────────

def _extract_gemini_text(data: dict, caller: str = "") -> str | None:
    """
    Pull text out of a Gemini generateContent response.
    Handles safety blocks, MAX_TOKENS truncation, and missing content gracefully.
    Logs a clear, readable message (no extra={} dicts) so Render surfaces it.
    """
    # Prompt itself was blocked before generation
    prompt_feedback = data.get("promptFeedback", {})
    block_reason    = prompt_feedback.get("blockReason")
    if block_reason:
        logger.error(f"[{caller}] Gemini blocked prompt: blockReason={block_reason}")
        return None

    candidates = data.get("candidates", [])
    if not candidates:
        logger.error(f"[{caller}] Gemini returned no candidates. Full response: {str(data)[:400]}")
        return None

    candidate    = candidates[0]
    finish_reason = candidate.get("finishReason", "STOP")

    # Only STOP and MAX_TOKENS are usable; everything else (SAFETY, RECITATION, OTHER) is a failure
    if finish_reason not in ("STOP", "MAX_TOKENS"):
        logger.error(
            f"[{caller}] Gemini finished with reason={finish_reason}. "
            f"safetyRatings={candidate.get('safetyRatings', [])} "
            f"Full candidate: {str(candidate)[:400]}"
        )
        return None

    parts = candidate.get("content", {}).get("parts", [])
    if not parts:
        logger.error(
            f"[{caller}] Gemini returned empty parts. "
            f"finishReason={finish_reason} candidate={str(candidate)[:400]}"
        )
        return None

    text = parts[0].get("text", "").strip()
    if not text:
        logger.error(f"[{caller}] Gemini text part is blank. finishReason={finish_reason}")
        return None

    return text


def _extract_json_from_text(text: str) -> str:
    """
    Robustly extract a JSON object or array from text that may have prose around it.
    Handles:  plain JSON, ```json ... ``` fences, text-before-JSON preambles.
    Returns the original text unchanged if no JSON block is found.
    """
    # Strip markdown code fences
    fence_match = re.search(r"```(?:json)?\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*```", text, re.IGNORECASE)
    if fence_match:
        return fence_match.group(1).strip()

    # Find first { or [ and take from there to matching close
    start = -1
    open_char: str | None = None
    for i, ch in enumerate(text):
        if ch in ("{", "["):
            start    = i
            open_char = ch
            break

    if start != -1 and open_char is not None:
        close_char = "}" if open_char == "{" else "]"
        depth = 0
        for i in range(start, len(text)):
            if text[i] == open_char:
                depth += 1
            elif text[i] == close_char:
                depth -= 1
                if depth == 0:
                    return text[start : i + 1]

    return text  # unchanged — let the caller's json.loads raise


# ── Core Gemini caller — single-turn ──────────────────────────────────────────

async def _call_gemini(
    system_prompt: str,
    user_content: str,
    max_tokens: int = 2048,
    temperature: float = 0.7,
    json_mode: bool = False,
) -> str | None:
    """
    Single-turn Gemini call: system instruction + one user message.
    Used for question generation, scoring, and email drafting.
    Returns raw text or None on failure.
    """
    settings = get_settings()
    if not settings.gemini_api_key:
        logger.error("_call_gemini: GEMINI_API_KEY is empty — set it in Render environment variables")
        return None

    url = f"{GEMINI_URL}?key={settings.gemini_api_key}"

    gen_config: dict = {
        "temperature":     temperature,
        "maxOutputTokens": max_tokens,
    }
    if json_mode:
        gen_config["responseMimeType"] = "application/json"

    payload = {
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents":          [{"role": "user", "parts": [{"text": user_content}]}],
        "generationConfig":  gen_config,
    }

    for attempt in range(1, 3):
        try:
            async with httpx.AsyncClient(timeout=45) as client:
                response = await client.post(url, json=payload)

            if response.status_code == 200:
                data = response.json()
                text = _extract_gemini_text(data, caller="_call_gemini")
                if text is None:
                    return None
                # When JSON mode is on, strip any accidental markdown fences
                return _extract_json_from_text(text) if json_mode else text

            # Surface the actual Gemini error clearly in Render logs
            logger.error(
                f"_call_gemini HTTP {response.status_code} (attempt {attempt}): {response.text[:600]}"
            )
            if attempt == 1:
                await asyncio.sleep(settings.groq_retry_delay_seconds)

        except Exception as error:
            logger.error(f"_call_gemini exception (attempt {attempt}): {error}")
            if attempt == 1:
                await asyncio.sleep(settings.groq_retry_delay_seconds)

    return None


# ── Core Gemini caller — multi-turn conversation ───────────────────────────────

async def _call_gemini_conversation(
    system_prompt: str,
    contents: list[dict],
    max_tokens: int = 800,
    temperature: float = 0.75,
) -> str | None:
    """
    Multi-turn Gemini call for the interview conversation agent.
    contents: Gemini-format [{role: "user"|"model", parts: [{text: "..."}]}]
    Returns raw text (JSON string) or None on failure.

    NOTE: We do NOT use responseMimeType=application/json here because the model
    occasionally refuses to generate when the conversation history is long and
    JSON mode is enforced.  Instead we ask for JSON in the prompt and extract it
    with _extract_json_from_text() which handles markdown fences and preambles.
    """
    settings = get_settings()
    if not settings.gemini_api_key:
        logger.error("_call_gemini_conversation: GEMINI_API_KEY is empty")
        return None

    url     = f"{GEMINI_URL}?key={settings.gemini_api_key}"
    payload = {
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents":          contents,
        "generationConfig":  {
            "temperature":     temperature,
            "maxOutputTokens": max_tokens,
            # No responseMimeType — extract JSON from text instead (more robust)
        },
    }

    for attempt in range(1, 3):
        try:
            async with httpx.AsyncClient(timeout=45) as client:
                response = await client.post(url, json=payload)

            if response.status_code == 200:
                data = response.json()
                text = _extract_gemini_text(data, caller="_call_gemini_conversation")
                if text is None:
                    return None
                return _extract_json_from_text(text)

            logger.error(
                f"_call_gemini_conversation HTTP {response.status_code} (attempt {attempt}): "
                f"{response.text[:600]}"
            )
            if attempt == 1:
                await asyncio.sleep(settings.groq_retry_delay_seconds)

        except Exception as error:
            logger.error(f"_call_gemini_conversation exception (attempt {attempt}): {error}")
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

    raw_response = await _call_gemini(
        system_prompt=system_prompt,
        user_content=user_prompt,
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
            logger.error("Gemini returned unexpected questions format", extra={"raw": raw_response[:200]})
            return None
        return questions
    except json.JSONDecodeError as error:
        logger.error(
            "Failed to parse Gemini question generation response",
            extra={"error": str(error), "raw": raw_response[:200]},
        )
        return None


# ── 2. Adaptive next question ──────────────────────────────────────────────────

def _format_candidate_context(ctx: dict) -> str:
    """Format the candidate_context dict into a readable string for the prompt."""
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
    if ctx.get("github_analysis"):
        lines.append(f"GitHub Deep Analysis:\n{ctx['github_analysis']}")

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

    ctx_text   = _format_candidate_context(candidate_context or {})
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

    return await _call_gemini(
        system_prompt=system_prompt,
        user_content=user_prompt,
        max_tokens=200,
        temperature=0.75,
        json_mode=False,
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
    experience_level: str = "any",
    skills: list[str] | None = None,
) -> dict | None:
    """
    Generate a complete candidate assessment from the full interview transcript
    AND all submitted materials. Cross-references document claims vs interview performance.
    Returns a structured JSON assessment or None if scoring fails.
    """
    # Support both old Q&A format and new conversation format
    if transcript and transcript[0].get("role"):
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

    ctx_text      = _format_candidate_context(candidate_context or {})
    has_documents = bool(candidate_context)

    safe_name = candidate_name.strip() if candidate_name else ""
    name_instruction = (
        f"CRITICAL: The candidate's name is '{safe_name}'. "
        f"You MUST use ONLY this exact name in your assessment. "
        f"Never use any other name. Never infer a name from the transcript. "
        f"If you are ever uncertain, use 'the candidate' instead."
        if safe_name else
        "Do not use any candidate name in your assessment — use 'the candidate' throughout."
    )

    skills_text = ", ".join(skills) if skills else "see job description"

    system_prompt = (
        "You are a strict, evidence-only technical hiring evaluator. "
        "Your sole job is to protect the company from bad hires. You are NOT an encouragement bot. "
        "You do not soften assessments. You do not reward potential. You score only demonstrated evidence.\n\n"

        "SCORING RULES — read carefully, every rule is mandatory:\n"
        "1. Score each dimension ONLY against demonstrated evidence in the CV, transcript, and submitted materials. "
        "Zero evidence = score 0-20 for that dimension. Do not infer, assume, or reward 'willingness to learn'.\n"
        "2. 'Willingness to learn' is NOT a skill unless the role is explicitly entry-level and labelled as such.\n"
        "3. Soft skills (communication, teamwork, etc.) do NOT compensate for missing technical skills on technical roles.\n"
        "4. If the role requires specific tools/frameworks and the candidate shows none: technical_skills score max 25.\n"
        "5. Unqualified candidates MUST score below 40 overall. Do not soften this.\n"
        "6. Cite specific evidence for every claim — exact quote from transcript or exact line from CV.\n"
        "7. If no CV was submitted: penalise. Note 'No CV submitted' in concerns.\n"
        "8. If GitHub was submitted: assess actual repo quality, languages, and recency. An empty or irrelevant "
        "GitHub is a red flag, not neutral.\n\n"

        "NAME MISMATCH DETECTION:\n"
        "Compare the name on the CV (if submitted) against the candidate name used in the interview. "
        "If they differ significantly (different first name, completely different name), set identity_flag to a "
        "clear warning string. This is a potential CV fraud signal. Do not ignore it.\n\n"

        "SKILL GAP ANALYSIS:\n"
        f"Required skills for this role: {skills_text}\n"
        "For each required skill, explicitly state: Present (with evidence) / Partial (weak evidence) / Absent.\n"
        "Missing required skills must appear in areas_of_concern and reduce the overall score materially.\n\n"

        f"{name_instruction}\n\n"
        "Return valid JSON only. No preamble. No explanation. No markdown."
    )

    name_ref = safe_name if safe_name else "The candidate"

    user_prompt = (
        f"Job Title: {job_title}\n"
        f"Company: {company_name}\n"
        f"Candidate Interview Name: {safe_name if safe_name else 'Unknown'}\n"
        f"Required Skills: {skills_text}\n\n"
        f"Job Description:\n{job_description}\n\n"
        f"Focus Areas: {', '.join(focus_areas)}\n\n"
        f"Submitted Materials:\n{ctx_text}\n\n"
        f"Full Interview Transcript:\n{transcript_text}\n\n"
        "Produce a JSON assessment with EXACTLY these fields:\n"
        "- overall_score: integer 0-100. Must be below 40 if candidate lacks core required skills.\n"
        f"- score_breakdown: object with integer 0-100 for each of: {list({area: 0 for area in focus_areas}.keys())}. "
        "Each score must reflect only demonstrated evidence, not potential.\n"
        f"- executive_summary: 4-5 sentences. Cite specific lines from CV or transcript quotes. "
        f"Compare required skills vs demonstrated skills explicitly. "
        f"Refer to candidate as '{safe_name if safe_name else 'the candidate'}'. Be direct and honest.\n"
        "- key_strengths: array of exactly 3 strings. Each must cite specific evidence. "
        "If fewer than 3 genuine strengths exist, state the limitation honestly.\n"
        "- areas_of_concern: array of 2-5 strings. Include every missing required skill. "
        "Include any contradiction between CV claims and interview answers. No softening.\n"
        "- red_flags: array of strings. List: missing required skills, CV/transcript contradictions, "
        "suspiciously generic answers, empty GitHub repos, unexplained employment gaps, "
        "identity/name mismatches. Empty array if none found.\n"
        "- identity_flag: string or null. If CV name differs from interview candidate name, "
        "write a clear warning. Example: 'CV name (Sarah Johnson) does not match interview "
        "candidate (Mike Doe). Possible CV fraud.' Otherwise null.\n"
        + (
            "- document_interview_alignment: exactly one of: 'Strong alignment', 'Moderate alignment', "
            "'Weak alignment', 'Discrepancies found'.\n"
            if has_documents else
            "- document_interview_alignment: 'No documents submitted'\n"
        ) +
        "- recommended_follow_up_questions: array of exactly 3 strings for the human interviewer. "
        "Focus on gaps, contradictions, and unverified claims.\n"
        "- hiring_recommendation: exactly one of: Strong Yes, Yes, Maybe, No, Strong No. "
        "A candidate missing core required skills must be No or Strong No.\n"
    )

    raw_response = await _call_gemini(
        system_prompt=system_prompt,
        user_content=user_prompt,
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
            "Failed to parse Gemini scoring response",
            extra={"error": str(error), "raw": raw_response[:200]},
        )
        return None


# ── 4. Candidate notification email generation ────────────────────────────────

async def generate_candidate_email(
    status: str,
    tone: str,
    candidate_name: str,
    job_title: str,
    company_name: str,
    executive_summary: str,
    key_strengths: list[str],
    areas_of_concern: list[str],
    company_email: str = "",
    company_website: str = "",
) -> dict | None:
    """
    Generate a candidate notification email draft.
    status: 'shortlisted' | 'rejected' | 'accepted'
    tone:   'professional' | 'warm' | 'direct'
    Returns {subject, body} or None on failure.
    """
    first_name = candidate_name.split()[0] if candidate_name else "there"

    tone_structures = {
        "professional": (
            "PROFESSIONAL TONE RULES:\n"
            "- Three paragraphs, each with a clear single purpose.\n"
            "- Formal but not cold. No contractions.\n"
            "- Use the candidate's first name once, at the opening only.\n"
            "- Sentences are complete and precise. No sentence fragments.\n"
            "- Reads like a letter from a senior HR professional."
        ),
        "warm": (
            "WARM TONE RULES:\n"
            "- Write as an individual, not an institution. Use contractions freely.\n"
            "- Acknowledge their effort briefly and genuinely, not with a formula.\n"
            "- One sentence that sounds like a real human wrote it, not a template.\n"
            "- Less formal paragraph structure, more conversational flow.\n"
            "- Should feel like it came from a person who remembers the conversation."
        ),
        "direct": (
            "DIRECT TONE RULES:\n"
            "- 60 to 90 words maximum. Not a word more.\n"
            "- State the decision in sentence one. No preamble, no 'I hope this finds you well'.\n"
            "- One reason. One next step. Sign off.\n"
            "- No filler words. No hedging. Firm, fair, fast.\n"
            "- Reads like a message from someone who respects the candidate's time."
        ),
    }
    tone_guidance = tone_structures.get(tone.lower(), tone_structures["professional"])

    strengths_raw   = "\n".join(f"- {s}" for s in key_strengths)  if key_strengths  else "(none provided)"
    concerns_raw    = "\n".join(f"- {c}" for c in areas_of_concern) if areas_of_concern else "(none provided)"
    summary_full    = executive_summary[:2000] if executive_summary else ""

    footer_lines = [company_name] if company_name else []
    if company_email:
        footer_lines.append(company_email)
    if company_website:
        footer_lines.append(company_website)
    footer_text = "\n".join(footer_lines)

    if summary_full or key_strengths or areas_of_concern:
        assessment_block = (
            f"=== CANDIDATE ASSESSMENT DATA ===\n"
            f"Executive summary: {summary_full if summary_full else '(not yet available)'}\n\n"
            f"Key strengths:\n{strengths_raw}\n\n"
            f"Areas of concern:\n{concerns_raw}\n"
            f"=================================\n"
        )
        signal_instructions = (
            "SIGNAL EXTRACTION — mandatory, non-negotiable:\n"
            "Read the CANDIDATE ASSESSMENT DATA above carefully.\n"
            "You MUST extract ONE concrete signal from it. Not a category, not a description — "
            "a specific thing: a named technology, a quantified result, a specific project, "
            "a concrete demonstrated skill, a named tool, or a real scenario from the interview.\n\n"
            "GOOD signal examples: 'your experience with React and Node.js', "
            "'the CRM migration project you described', 'your background in financial modelling', "
            "'your five years managing cross-functional teams'.\n"
            "BAD signals (forbidden): 'your experience', 'relevant background', 'strong communication', "
            "'good culture fit', 'impressive credentials', 'your qualifications'.\n\n"
            "ABSOLUTE PROHIBITION: You may NEVER write 'assessment data does not provide' or any "
            "equivalent phrase. If data is sparse, use the most specific thing available. "
            "If only a job title and company name are known, reference what the role requires. "
            "A concrete reference to the role requirements is better than a generic phrase.\n\n"
            f"{assessment_block}"
        )
    else:
        signal_instructions = (
            "SIGNAL EXTRACTION:\n"
            "No detailed assessment data is available for this candidate. "
            "Reference something specific about the role itself rather than making up candidate details.\n"
            "Do NOT write 'assessment data does not provide'. Reference the role requirements instead.\n"
        )

    if status == "shortlisted":
        instructions = (
            f"Write a shortlist notification for {first_name} ({candidate_name}).\n\n"
            f"- Say they are being shortlisted for {job_title} at {company_name}.\n"
            "- Use the extracted signal to reference ONE concrete thing that stood out. "
            "This must be something specific to this candidate, not praise that could apply to anyone.\n"
            "- Tell them what happens next: the team will be in touch to arrange the next stage.\n"
            "- Do NOT say: 'we were impressed', 'exciting opportunity', 'strong pool of candidates', "
            "'you stood out', 'we are delighted'.\n"
            "- Do NOT overpromise on timelines.\n"
            "- Target length: 100-160 words. Direct tone: 60-90 words.\n\n"
            f"{signal_instructions}"
        )
    elif status == "rejected":
        instructions = (
            f"Write a rejection email for {first_name} ({candidate_name}).\n\n"
            f"- Thank them for their time interviewing for {job_title} at {company_name}.\n"
            "- Be clear this is a rejection. Do not soften it so much they have to re-read to understand.\n"
            "- Use the extracted signal to give ONE specific, role-based reason. "
            "Not a personal criticism. Tied to the requirements of the role.\n"
            "- BANNED phrases: 'unfortunately', 'regrettably', 'sadly', 'we regret to inform', "
            "'it is with regret', 'we are sorry', 'not a fit', 'at this time', 'on this occasion', "
            "'not successful', 'keep your CV on file', 'best of luck', 'we had many strong candidates', "
            "'moving on', 'not moving forward'.\n"
            "- Sound like a person who read their application, not HR software.\n"
            "- Close with genuine respect. They gave real time to this.\n"
            "- Target length: 90-140 words. Direct tone: 60-90 words.\n\n"
            f"{signal_instructions}"
        )
    else:  # accepted
        instructions = (
            f"Write an offer progression email for {first_name} ({candidate_name}) "
            f"for {job_title} at {company_name}.\n\n"
            "- Confirm they have been selected to progress to the offer stage.\n"
            "- Be explicit about next steps: a member of the team will be in touch shortly "
            "with the formal offer and next stage details.\n"
            "- This is a clear signal, not a celebration. Do not say 'congratulations', "
            "'we are thrilled', 'delighted', or 'excited'.\n"
            "- Target length: 80-130 words. Direct tone: 50-80 words.\n\n"
            f"{signal_instructions}"
        )

    system_prompt = (
        f"You are writing a candidate notification email on behalf of the hiring team at {company_name}.\n\n"
        f"{tone_guidance}\n\n"
        "MANDATORY EMAIL STRUCTURE — every email must have all of these, in order:\n"
        "1. Greeting line: 'Dear [FirstName],' — always on its own line.\n"
        "2. Opening paragraph: state the purpose of the email clearly within the first sentence.\n"
        "3. Body paragraph: reference ONE specific thing from the assessment data about this candidate. "
        "This must be concrete and tied to the role.\n"
        "4. Next step paragraph: tell the candidate clearly what happens next. Specific, not vague.\n"
        "5. Sign-off line: 'Kind regards,' or 'Best regards,' — on its own line.\n"
        "6. Name line: 'The Hiring Team' or equivalent — on the next line after sign-off.\n"
        f"7. Footer block — exactly as follows, each item on its own line:\n{footer_text if footer_text else company_name}\n\n"
        "Blank line between each section. No section may be omitted.\n"
        "DIRECT tone may compress the body and next step into one short paragraph, "
        "but must still include all 7 structural elements.\n\n"
        "NON-NEGOTIABLE QUALITY RULES:\n"
        "- No 'we were blown away'. No 'exciting opportunity'. No corporate filler.\n"
        "- Sound like a sharp human who actually read this candidate's file.\n"
        "- Every word earns its place. Cut anything that does not add information.\n"
        "- Never use em dashes. Use commas or periods.\n"
        "- Subject line: clear, direct, no clickbait. Must immediately tell the candidate "
        "whether this is good news or not.\n\n"
        "Return valid JSON only. No markdown. No explanation. No preamble.\n"
        '{"subject": "...", "body": "..."}\n'
        "The body must be plain text. Blank lines between sections. No HTML. No markdown.\n"
        "The three tones must produce structurally different emails, not the same email "
        "with different adjectives."
    )

    user_prompt = (
        f"Candidate: {candidate_name}\n"
        f"Job: {job_title} at {company_name}\n\n"
        f"{instructions}"
    )

    raw = await _call_gemini(
        system_prompt=system_prompt,
        user_content=user_prompt,
        max_tokens=900,
        temperature=0.65,
        json_mode=True,
    )

    if not raw:
        return None

    try:
        parsed = json.loads(raw)
        return {
            "subject": str(parsed.get("subject", "")).strip(),
            "body":    str(parsed.get("body",    "")).strip(),
        }
    except json.JSONDecodeError as error:
        logger.error("Failed to parse Gemini email response", extra={"error": str(error), "raw": raw[:200]})
        return None


# ── 5. Conversational interview driver ────────────────────────────────────────

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
    Warm, human, and specific to the company and role.
    """
    first_name = candidate_name.split()[0] if candidate_name else "there"
    company    = company_name.strip() if company_name else "the company"
    role       = job_title.strip()    if job_title    else "this role"

    if resumed and last_ai_message:
        # Resuming — recap where we left off, don't repeat the full intro
        last_sentence = last_ai_message.split(".")[0].strip()
        message = (
            f"Welcome back, {first_name}. We left off at: \"{last_sentence}.\" "
            f"Ready to continue?"
        )
    else:
        # Fresh start — greet by name, set context, invite naturally
        message = (
            f"Hi {first_name}, thanks for taking the time today. "
            f"I'm reaching out on behalf of {company} — I'll be walking you through "
            f"a short conversation about the {role} role. "
            f"Nothing too formal, just want to get a sense of who you are and what "
            f"you've been working on. "
            f"To kick things off, could you tell me a little about your background?"
        )

    return {
        "message":           message,
        "action":            "continue",
        "requirement_id":    None,
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
    department: str = "",
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

    required_items  = [r for r in candidate_requirements if r.get("required")]
    optional_items  = [r for r in candidate_requirements if not r.get("required")]
    pending         = [r for r in required_items if r.get("id") not in collected_requirement_ids]
    already_collected = [r for r in required_items if r.get("id") in collected_requirement_ids]
    optional_pending  = [r for r in optional_items if r.get("id") not in collected_requirement_ids]

    pending_lines = (
        "\n".join(f"  - {r['label']} ({'file upload' if r.get('type') == 'file' else 'link'}) [id: {r['id']}]"
                  for r in pending)
        or "None — all required items collected."
    )
    optional_lines = (
        "\n".join(f"  - {r['label']} ({'file upload' if r.get('type') == 'file' else 'link'}) [id: {r['id']}] — optional"
                  for r in optional_pending)
        or "None."
    )
    collected_lines = (
        "\n".join(f"  ✓ {r['label']}" for r in already_collected)
        or "None yet."
    )

    candidate_turn_count = sum(1 for m in conversation if m.get("role") == "candidate")

    skills_text     = ", ".join(skills) if skills else "see job description"
    seniority_text  = experience_level.replace("_", " ").title() if experience_level and experience_level != "any" else "Not specified"
    department_line = f"Department: {department}\n" if department else ""

    system_prompt = (
        f"You are an elite human recruiter. Sharp, warm, deeply intelligent, and quietly ruthless "
        f"in your ability to read people. You are conducting a live screening interview for "
        f"{job_title} at {company_name}. You feel entirely human. You think in real time. "
        f"You adapt to every answer. You are not running a script. You are having a conversation "
        f"with a purpose.\n\n"

        f"---\n\n"
        f"THE ROLE\n"
        f"Title: {job_title}\n"
        f"Company: {company_name}\n"
        f"{department_line}"
        f"Seniority: {seniority_text}\n"
        f"Key skills: {skills_text}\n"
        f"Job description: {job_description[:2000]}\n\n"

        f"---\n\n"
        f"CANDIDATE\n"
        f"Full name: {candidate_name}\n"
        f"Address as '{first_name}' at most once every 5 messages. Never use their name more than necessary.\n\n"

        f"---\n\n"
        "YOUR COMPLETE COLLECTION CHECKLIST\n"
        "You must collect ALL of the following before closing. Track what has been covered and "
        "never re-ask anything already answered.\n\n"
        "Personal details, collect in order, one at a time:\n"
        "  1. Full name\n"
        "  2. Email address\n"
        "  3. Phone number\n"
        "  4. Current location\n"
        "  5. Current employment status\n\n"
        "Role assessment: cover the most relevant areas from the job description. Ask role-specific, "
        "experience-based questions. Never generic. Never textbook. Always earned from what the "
        "candidate just said.\n\n"
        f"Required documents still pending (MUST collect all before closing):\n{pending_lines}\n"
        f"Optional documents (ask at a natural moment — never force):\n{optional_lines}\n"
        f"Already collected: {collected_lines}\n\n"

        "---\n\n"
        "DOCUMENT COLLECTION, INTELLIGENT TIMING\n"
        "Do not wait until the end to collect all documents. Request them at the smartest moment.\n"
        "If the candidate mentions something that corresponds to a required document, request it immediately.\n"
        "You may collect two documents back to back if the flow supports it.\n"
        "Never batch-request multiple documents in one message.\n"
        "You must collect ALL required documents before closing.\n"
        "After a document is uploaded or a link is submitted, affirm briefly and continue.\n\n"
        "OPTIONAL DOCUMENTS — strict rules:\n"
        "  - Ask for each optional document once, at a natural moment in the conversation.\n"
        "  - If the candidate says they do not have it, says 'I don't have one', declines, or does not respond "
        "to a second prompt, accept it immediately. 'No problem, that's fine.' Then move on.\n"
        "  - Never ask for an optional document more than once.\n"
        "  - Never pressure, repeat, or imply the candidate should have submitted it.\n\n"
        "REQUIRED DOCUMENTS — if candidate cannot provide after two attempts:\n"
        "  - Say: 'Noted. We may follow up on that separately.' Then move on. Never loop.\n\n"
        "Accepted formats for any document: PDF, Word (.doc, .docx), images (.jpg, .png). "
        "Never reject a submission based on file format.\n\n"

        "---\n\n"
        "ROLE ASSESSMENT, DEPTH AND INTELLIGENCE\n"
        "Ask questions that are specific to this exact role at this exact company. Never ask questions "
        "that could apply to any company or any job. Every question must feel like it was written for "
        "this candidate based on what they just said.\n\n"
        "Cover the most critical competencies for the role. For technical roles: depth of skill, real "
        "project experience, debugging and failure. For commercial roles: numbers, deals, clients, losses. "
        "For creative roles: process, taste, constraints, failure. For operational roles: systems, edge "
        "cases, things that broke. For people roles: conflict, difficult personalities, outcomes.\n\n"
        "Adapt your tone to the role:\n"
        "  Technical: precise, curious, specific\n"
        "  Finance: measured, numerical, exacting\n"
        "  Hospitality and service: warm but probing, practical\n"
        "  Creative: open, exploratory, aesthetic\n"
        "  Executive: direct, strategic, high-stakes\n"
        "  Healthcare: careful, empathetic, procedural\n"
        "  Legal: methodical, precise, risk-aware\n"
        "  Sales: energetic, results-focused, skeptical of claims\n\n"

        "---\n\n"
        "ANTI-AI AND ANTI-FABRICATION PROTOCOL, ALL ROLES\n"
        "This is your most important responsibility. Polished, clean, complete answers are a red flag. "
        "Real human experience is specific, imperfect, and slightly uncomfortable. Your job is to get there.\n\n"
        "After every substantive answer, deploy one of the following without announcing it:\n\n"
        "Demand specificity. If they say they managed a team, ask how many people, what the hardest "
        "conversation was, what one of them would say about them today.\n\n"
        "Introduce a subtle misconception. State something slightly wrong about the role or field and "
        "observe. A candidate with real knowledge corrects you. A candidate running on AI agrees or hedges.\n\n"
        "Contradict their own answer. Reference something they said earlier and put gentle pressure on it. "
        "Real candidates navigate this naturally. AI-assisted candidates repeat themselves or collapse.\n\n"
        "Ask for the failure. Ask what went wrong in a project, what they mishandled, what they would do "
        "differently. Perfect track records do not exist. If they cannot produce a real failure, probe harder.\n\n"
        "Reference their submitted documents specifically. If they submitted a CV, ask about a specific role "
        "or gap on it. If they submitted a GitHub link, ask why they made a specific architectural decision. "
        "If they submitted a portfolio, ask about a piece that did not land. If they cannot speak to their "
        "own submissions in detail, flag it.\n\n"
        "Ask for the uncomfortable version. For finance: tell me about a time your numbers were wrong. "
        "For hospitality: tell me about a guest situation you genuinely mishandled. For sales: tell me "
        "about a deal you lost that you should have won. For tech: tell me about code you shipped that "
        "broke in production. For management: tell me about someone you managed out and whether it was "
        "the right call.\n\n"
        "Hunt for mess. Hesitation, course-correction, specific dates, specific names withheld for privacy, "
        "specific emotions, these are signals of real experience. Smooth, structured, comprehensive answers "
        "on the first try are not.\n\n"
        "Never accuse. Never say you are testing them. Just go deeper.\n\n"

        "---\n\n"
        "AFFIRMATIONS, INTELLIGENCE TEST\n"
        "Every affirmation must be semantically matched to the content of the answer. Generic affirmations "
        "are a failure.\n\n"
        "  Phone number: 'Got that.' or 'Perfect, noted.'\n"
        "  Location: 'Good to know.' or 'Noted.'\n"
        "  Employment status: 'Appreciated.' or 'Good context.'\n"
        "  Detailed experience: 'That's solid experience.' or 'Sounds like real depth there.'\n"
        "  Honest gap or failure: 'Appreciate the honesty.' or 'That's fair.'\n"
        "  Strong specific answer: 'That's exactly what I was hoping to hear.' or 'Sharp.'\n"
        "  Thin answer: Move immediately to a follow-up probe. Do not reward vagueness.\n"
        "  File or link submitted: 'Got it, thank you.' or 'Perfect, received.'\n\n"
        "Banned words and phrases: 'That makes sense' unless the answer is literally an explanation. "
        "'Excellent.' 'Amazing.' 'Wonderful.' 'Great answer.' 'Fantastic.' 'Absolutely.' 'Certainly.' "
        "'Of course.'\n"
        "Never repeat the same affirmation twice in a row.\n\n"

        "---\n\n"
        "ERROR DETECTION\n"
        "Never accept incorrect or incomplete data.\n"
        "  Phone looks wrong: 'That number doesn't look quite right. Could you check it for me?'\n"
        "  Email looks wrong: 'Just want to make sure I have that right. Could you confirm your email?'\n"
        "  Location too vague: 'Could you give me a more specific city or region?'\n"
        "  Contradiction detected: 'Earlier you said X, but now it sounds like Y. Help me understand that.'\n"
        "  Vague or thin answer: 'Could you give me a concrete example of that?'\n"
        "  Document submitted but name or details do not match candidate: Note the discrepancy. "
        "Do not accuse. Ask the candidate to confirm the document belongs to them.\n\n"

        "---\n\n"
        "CONVERSATION INTELLIGENCE\n"
        "One question per message. Never two. No sub-questions inside a question.\n"
        "Every question must be directly informed by what the candidate just said.\n"
        "If an answer is thin, probe it before moving on.\n"
        "If an answer opens an interesting thread, follow it before returning to the checklist.\n"
        "If a candidate is clearly underqualified based on their answers, continue the interview "
        "professionally to completion. Do not signal your assessment.\n"
        "If a candidate is exceptional, go deeper. Push harder. Give them room to shine.\n"
        "Never explain this process. Never mention AI. Never break character.\n"
        "Never use em dashes. Use commas or periods.\n\n"

        "---\n\n"
        "CLOSING\n"
        "Only close when every item on the checklist is complete: all 5 personal details, all role "
        "assessment questions, ALL required documents collected.\n\n"
        f"Closing message exactly: 'That's everything I need. Thank you for your time. "
        f"The team at {company_name} will be in touch if you're selected to move forward. Good luck.'\n\n"
        "Then set action to complete. Never close early. Never close with items outstanding.\n\n"

        f"Conversation turns so far: {candidate_turn_count}\n\n"

        "---\n\n"
        "OUTPUT FORMAT\n"
        "Valid JSON only. No markdown. No explanation. No preamble.\n\n"
        '{"message": "...", "action": "continue | request_file | request_link | complete", '
        '"requirement_id": null, "requirement_label": null}'
    )

    # Build Gemini contents list from conversation history.
    # Gemini requires: alternating user/model turns, always starting with user.
    raw_contents: list[dict] = []
    for msg in conversation:
        role    = msg.get("role", "")
        content = msg.get("content", "")
        if role == "ai":
            raw_contents.append({"role": "model", "parts": [{"text": content}]})
        elif role == "candidate":
            raw_contents.append({"role": "user",  "parts": [{"text": content}]})

    # Ensure the conversation starts with a user turn (Gemini requirement)
    if not raw_contents or raw_contents[0]["role"] != "user":
        raw_contents.insert(0, {"role": "user", "parts": [{"text": "Ready."}]})

    # Deduplicate consecutive same-role messages (merge their text)
    gemini_contents: list[dict] = [raw_contents[0]]
    for msg in raw_contents[1:]:
        if msg["role"] == gemini_contents[-1]["role"]:
            gemini_contents[-1]["parts"][0]["text"] += "\n" + msg["parts"][0]["text"]
        else:
            gemini_contents.append(msg)

    raw = await _call_gemini_conversation(
        system_prompt=system_prompt,
        contents=gemini_contents,
        max_tokens=600,
        temperature=0.75,
    )

    if not raw:
        return None

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as error:
        logger.error("Failed to parse Gemini conversation response",
                     extra={"error": str(error), "raw": raw[:200]})
        return None

    valid_actions = {"continue", "request_file", "request_link", "complete"}
    action = parsed.get("action", "continue")
    if action not in valid_actions:
        action = "continue"

    return {
        "message":           str(parsed.get("message", "")).strip(),
        "action":            action,
        "requirement_id":    parsed.get("requirement_id"),
        "requirement_label": parsed.get("requirement_label"),
    }
