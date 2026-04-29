"""
HireIQ AI service — pure Groq SDK.
Model: Groq LLaMA 3.3 70B Versatile (AsyncGroq).

Functions:
  1. generate_interview_questions  -- structured question generation
  2. generate_job_prefill          -- full job posting draft from title + department
  3. generate_adaptive_next_question -- single follow-up question
  4. score_candidate               -- full assessment (4-dimension scoring)
  5. generate_candidate_email      -- candidate notification email drafts
  6. generate_conversation_response -- live application conversation driver
  7. get_first_interview_message   -- hardcoded opening (never AI-generated)
"""

import json
import re
import asyncio
import logging
from groq import AsyncGroq
from app.config import get_settings

logger = logging.getLogger("hireiq.groq")

MODEL = "llama-3.3-70b-versatile"


# ── Shared helpers ─────────────────────────────────────────────────────────────

def _extract_json_from_text(text: str) -> str:
    """
    Robustly extract a JSON object or array from text that may have prose around it.
    Handles plain JSON, ```json ... ``` fences, and text-before-JSON preambles.
    Returns the original text unchanged if no JSON block is found.
    """
    fence_match = re.search(r"```(?:json)?\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*```", text, re.IGNORECASE)
    if fence_match:
        return fence_match.group(1).strip()

    start    = -1
    open_char: str | None = None
    for i, ch in enumerate(text):
        if ch in ("{", "["):
            start     = i
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

    return text


def _build_groq_client() -> AsyncGroq:
    settings = get_settings()
    return AsyncGroq(api_key=settings.groq_api_key)


# ── Core Groq caller ───────────────────────────────────────────────────────────

async def _call_groq_with_retry(
    messages: list[dict],
    max_tokens: int = 2048,
    temperature: float = 0.7,
    json_mode: bool = False,
) -> str | None:
    """
    Call Groq LLaMA with automatic retry on failure.
    Accepts a pre-built messages list (system + user/assistant turns).
    Returns extracted text or None on total failure.
    """
    settings = get_settings()
    client   = _build_groq_client()

    kwargs: dict = {
        "model":       MODEL,
        "messages":    messages,
        "max_tokens":  max_tokens,
        "temperature": temperature,
        "timeout":     settings.groq_timeout_seconds,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    for attempt in range(1, 3):
        try:
            response = await client.chat.completions.create(**kwargs)
            text     = response.choices[0].message.content or ""
            text     = text.strip()
            return _extract_json_from_text(text) if json_mode else text
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
    Generate structured application questions for a job posting.
    Returns a list of question objects or None if generation fails.
    """
    requirements_context = ""
    if candidate_requirements:
        req_lines = []
        for r in candidate_requirements:
            kind = "file upload" if r.get("type") == "file" else "link"
            req_lines.append(f"  - {r['label']} ({kind}{'-- required' if r.get('required') else '-- optional'})")
        requirements_context = (
            "\n\nCandidate Requirements -- this company requires candidates to submit:\n"
            + "\n".join(req_lines)
            + "\n\nIMPORTANT: Generate at least 1-2 questions that explicitly reference these "
            "submitted materials. For example: if GitHub is required, ask about their code. "
            "If a cover letter is required, probe their stated motivation."
        )

    system_prompt = (
        "You are a senior talent acquisition specialist generating application questions for a specific role. "
        "Your questions help candidates demonstrate genuine capability -- not rehearsed answers. "
        "\n\n"
        "QUESTION TYPE VOCABULARY -- pick the most appropriate type for each question:\n"
        "  behavioral       -- STAR-format past experience ('Tell me about a time when...')\n"
        "  situational      -- hypothetical scenarios ('How would you handle...')\n"
        "  motivational     -- why this role/company/field ('What draws you to...')\n"
        "  experience_depth -- probing existing expertise ('Walk me through your experience with...')\n"
        "  technical        -- role-specific knowledge or process ('How do you approach...')\n"
        "  values_culture   -- alignment with working style/values ('Describe the environment where you thrive')\n"
        "  achievement      -- specific accomplishments ('What is the project you are most proud of')\n"
        "  challenge        -- how they handle adversity ('Describe a significant challenge you faced')\n"
        "  leadership       -- influence or management ('Describe a time you led without formal authority')\n"
        "  collaboration    -- teamwork and communication ('How do you work with difficult colleagues')\n"
        "  ambition         -- career goals and growth mindset ('Where do you see yourself in 3 years')\n"
        "  analytical       -- problem-solving and reasoning ('Walk me through how you would analyse this')\n"
        "  open_invitation  -- closing catch-all ('Is there anything else you want us to know')\n"
        "\n"
        "RULES:\n"
        "- The first question must be a warm professional opener (motivational or experience_depth).\n"
        "- The last question must always be open_invitation.\n"
        "- Never use yes/no questions. Never use cliches ('Where do you see yourself in 5 years').\n"
        "- Every question must require a substantive, specific answer.\n"
        "- Distribute types across the question set -- do not repeat the same type more than twice.\n"
        "- Each question must directly relate to the job description and focus areas.\n"
        "\n"
        "Return a JSON object with a single key 'questions' containing an array of question objects "
        "each with fields: id (string, q1/q2/etc), question (string), type (string -- from the vocabulary above), "
        "focus_area (string), what_it_reveals (string -- 1 sentence explaining what a strong answer demonstrates)."
    )

    user_prompt = (
        f"Job Title: {job_title}\n\n"
        f"Job Description:\n{job_description}\n\n"
        f"Focus Areas: {', '.join(focus_areas)}"
        f"{requirements_context}\n\n"
        f"Generate exactly {question_count} questions."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user",   "content": user_prompt},
    ]

    raw_response = await _call_groq_with_retry(
        messages=messages,
        max_tokens=3000,
        temperature=0.7,
        json_mode=True,
    )

    if not raw_response:
        return None

    try:
        parsed    = json.loads(raw_response)
        questions = parsed.get("questions", [])
        if not isinstance(questions, list):
            logger.error(f"Unexpected questions format: {raw_response[:200]}")
            return None
        return questions
    except json.JSONDecodeError as error:
        logger.error(f"Failed to parse question generation response: {error}. Raw: {raw_response[:200]}")
        return None


# ── 1b. Job pre-fill generation ───────────────────────────────────────────────

async def generate_job_prefill(job_title: str, department: str) -> dict | None:
    """
    Given a job title and department, generate a complete job posting draft:
    description, required skills, nice-to-have skills, eligibility criteria,
    and 6-8 interview questions.

    Returns a dict or None on failure.
    """
    system_prompt = (
        "You are a senior HR specialist creating professional job postings. "
        "Given only a job title and department, produce a realistic, detailed job posting draft. "
        "\n\n"
        "Return ONLY valid JSON with exactly these fields:\n"
        "{\n"
        '  "description": "<150-200 word professional job description covering key responsibilities, '
        'day-to-day work, expectations, and team context>",\n'
        '  "required_skills": ["<skill>", ...],   // 5-8 most critical skills\n'
        '  "nice_to_have_skills": ["<skill>", ...], // 3-5 bonus skills\n'
        '  "eligibility": {\n'
        '    "min_education": "<one of: none|high_school|associate|bachelor|master|phd>",\n'
        '    "min_experience_years": <integer 0-10>,\n'
        '    "required_certifications": ["<cert>", ...],  // empty array if none\n'
        '    "work_auth_required": <true|false>,\n'
        '    "languages": ["English", ...]  // at minimum English\n'
        "  },\n"
        '  "questions": [  // exactly 7 interview questions\n'
        "    {\n"
        '      "id": "q1",\n'
        '      "question": "<question text>",\n'
        '      "type": "<behavioral|situational|motivational|experience_depth|technical|values_culture|achievement>",\n'
        '      "focus_area": "<area this probes, e.g. Technical Skills, Communication, Leadership>",\n'
        '      "what_it_reveals": "<1-sentence explanation>",\n'
        '      "severity": "standard"\n'
        "    },\n"
        "    ...\n"
        "  ]\n"
        "}\n\n"
        "QUESTION RULES: first question must be motivational (warm opener). "
        "Last question must be open_invitation type asking if there is anything else they want to share. "
        "Never repeat question types more than twice. All questions must be specific to the role."
    )

    user_prompt = f"Job Title: {job_title}\nDepartment: {department}"

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user",   "content": user_prompt},
    ]

    raw = await _call_groq_with_retry(
        messages=messages,
        max_tokens=3000,
        temperature=0.65,
        json_mode=True,
    )

    if not raw:
        return None

    try:
        parsed = json.loads(raw)
        required_keys = {"description", "required_skills", "nice_to_have_skills", "eligibility", "questions"}
        if not required_keys.issubset(parsed.keys()):
            logger.error(f"generate_job_prefill: missing keys. Got: {list(parsed.keys())}")
            return None
        return parsed
    except json.JSONDecodeError as e:
        logger.error(f"generate_job_prefill: JSON parse error: {e}. Raw[:200]: {raw[:200]}")
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
        lines.append(f"LinkedIn: {ctx['linkedin_url']}")
    if ctx.get("github_url"):
        lines.append(f"GitHub: {ctx['github_url']}")
    if ctx.get("portfolio_url"):
        lines.append(f"Portfolio: {ctx['portfolio_url']}")
    if ctx.get("website_url"):
        lines.append(f"Website: {ctx['website_url']}")
    if ctx.get("portfolio_note"):
        lines.append(f"Portfolio note: {ctx['portfolio_note']}")
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
        lines.append(f"GitHub Analysis:\n{ctx['github_analysis']}")

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
    Generate the single best next application question based on what the applicant just said.
    """
    transcript_text = "\n".join(
        f"Q: {entry.get('question', '')}\nA: {entry.get('answer', '')}"
        for entry in transcript
    )

    ctx_text   = _format_candidate_context(candidate_context or {})
    first_name = candidate_name.split()[0] if candidate_name else "the applicant"

    system_prompt = (
        f"You are a helpful recruiter guiding {first_name} through their application for "
        f"{job_title} at {company_name}. Your goal is to help them tell their story clearly.\n\n"
        f"Submitted materials:\n{ctx_text}\n\n"
        "Ask the single best next question. Rules:\n"
        "- If their answer was vague, ask for a specific example. Frame it helpfully: "
        "'Could you walk me through a specific example of that?'\n"
        "- If they mentioned something interesting, explore it naturally.\n"
        "- Reference their submitted materials when relevant.\n"
        "- One question only. No preamble. No filler.\n"
        f"- Use '{first_name}' occasionally, at most once every 4 questions.\n"
        "- Never use em dashes. Use commas or periods."
    )

    user_prompt = (
        f"Role: {job_title} at {company_name}\n\n"
        f"Job Description:\n{job_description}\n\n"
        f"Application so far:\n{transcript_text}\n\n"
        f"Applicant's last answer: {last_answer}\n\n"
        "Generate the single best next question:"
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user",   "content": user_prompt},
    ]

    return await _call_groq_with_retry(
        messages=messages,
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
    ai_deterrent_enabled: bool = False,
) -> dict | None:
    """
    Generate a complete applicant assessment from the full application transcript
    and all submitted materials.

    Scoring dimensions:
      - Relevance:     background match to role requirements (0-100)
      - Completeness:  all required info and docs provided (0-100, hard cap 40 if required doc missing)
      - Clarity:       specificity and concreteness of communication (0-100)
      - Red flags:     penalty dimension (reduces overall)
      - Overall:       weighted average of above
    Recommendation tiers: Strong Yes >= 80, Yes 65-79, Maybe 45-64, No 25-44, Strong No < 25
    """
    # Support both conversation format and legacy Q&A format
    if transcript and transcript[0].get("role"):
        pairs = []
        for i, msg in enumerate(transcript):
            if msg.get("role") == "ai" and msg.get("action") in (None, "continue"):
                next_msg = transcript[i + 1] if i + 1 < len(transcript) else None
                if next_msg and next_msg.get("role") == "candidate":
                    pairs.append(
                        f"AI: {msg.get('content', '')}\n"
                        f"Applicant: {next_msg.get('content', '')}\n"
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
        f"CRITICAL: The applicant's name is '{safe_name}'. "
        f"Use ONLY this exact name. Never infer a name from the transcript. "
        f"If uncertain, use 'the applicant' instead."
        if safe_name else
        "Do not use any applicant name -- use 'the applicant' throughout."
    )

    skills_text = ", ".join(skills) if skills else "see job description"

    system_prompt = (
        "You are a strict, evidence-only hiring evaluator. "
        "Your job is to give the recruiter an honest, accurate assessment they can act on. "
        "You score only demonstrated evidence. You do not soften assessments.\n\n"

        "SCORING DIMENSIONS:\n"
        "1. relevance (0-100): How well does the applicant's background match the role requirements? "
        "Score against demonstrated evidence only. Missing required skills = score below 30.\n"
        "2. completeness (0-100): Did they provide all required information and documents? "
        "HARD RULE: If any required document is missing, cap this score at 40 maximum regardless of everything else. "
        "If no documents were required, score based on information completeness.\n"
        "3. clarity (0-100): How specifically and concretely did they communicate? "
        "Vague, generic answers = low score. Specific examples with details = high score.\n"
        "4. red_flag_penalty (0-50): Penalty points that reduce the overall score. "
        "Apply for: missing required docs, CV/transcript contradictions, vague answers on critical questions, "
        "identity mismatches, empty or irrelevant GitHub repos submitted, unexplained gaps.\n"
        "5. overall_score: Calculated as round((relevance*0.4 + completeness*0.3 + clarity*0.3) - red_flag_penalty). "
        "Clamp to 0-100. Must be below 40 if applicant lacks core required skills.\n\n"

        "RECOMMENDATION TIERS:\n"
        "Strong Yes: overall >= 80. Yes: 65-79. Maybe: 45-64. No: 25-44. Strong No: below 25.\n"
        "A Strong No must use direct, specific language -- not diplomatic. "
        "Companies need reliable recommendations, not polite ones.\n\n"

        "NAME MISMATCH:\n"
        "Compare CV name (if submitted) against the applicant name. "
        "If they differ significantly, set identity_flag to a clear warning. "
        "Do not ignore potential CV fraud.\n\n"

        "SKILL GAP ANALYSIS:\n"
        f"Required skills: {skills_text}\n"
        "For each required skill: Present (with evidence) / Partial (weak evidence) / Absent.\n\n"

        f"{name_instruction}\n\n"

        + (
            "AI RESPONSE DETECTION -- ENHANCED PENALTY (deterrent was shown to this candidate):\n"
            "This candidate was explicitly warned that AI detection is active and AI-generated "
            "responses receive a stronger score penalty.\n"
            "HARD RULES -- all must be applied:\n"
            "1. If ANY answer shows signs of AI generation (generic phrasing, no personal specificity, "
            "template-like structure, no concrete examples, hedging like 'I believe' / 'It is important to'), "
            "set red_flag_penalty to 45-50 regardless of other factors.\n"
            "2. Cap overall_score at 45 for any candidate with confirmed AI-generated responses.\n"
            "3. List each AI-flagged answer in red_flags with a brief reason (e.g. 'Q3: generic structure, "
            "no specific example, template phrasing detected').\n"
            "4. Set hiring_recommendation to 'No' or 'Strong No' if two or more responses appear AI-generated.\n"
            "AI-generated responses after seeing a deterrent are equivalent to submission fraud -- "
            "score accordingly. Do not soften this.\n\n"
            if ai_deterrent_enabled else
            "AI RESPONSE DETECTION -- STANDARD:\n"
            "AI detection is always active. If any answer appears AI-generated (generic phrasing, "
            "no personal specificity, no concrete examples), flag it in red_flags and apply a "
            "red_flag_penalty of up to 20. AI detection alone should not cause automatic rejection -- "
            "use professional judgment on severity.\n\n"
        ) +

        "Return valid JSON only. No preamble. No explanation. No markdown."
    )

    name_ref = safe_name if safe_name else "the applicant"

    user_prompt = (
        f"Job Title: {job_title}\n"
        f"Company: {company_name}\n"
        f"Applicant Name: {safe_name if safe_name else 'Unknown'}\n"
        f"Required Skills: {skills_text}\n\n"
        f"Job Description:\n{job_description}\n\n"
        f"Focus Areas: {', '.join(focus_areas)}\n\n"
        f"Submitted Materials:\n{ctx_text}\n\n"
        f"Full Application Transcript:\n{transcript_text}\n\n"
        "Produce a JSON assessment with EXACTLY these fields:\n"
        "- overall_score: integer 0-100\n"
        "- score_breakdown: object with integer scores for: relevance, completeness, clarity, red_flag_penalty\n"
        f"- executive_summary: 4-5 sentences. Cite specific evidence from the transcript or documents. "
        f"Compare required skills vs demonstrated skills. "
        f"Refer to applicant as '{name_ref}'. Be direct and honest.\n"
        "- key_strengths: array of exactly 3 strings, each citing specific evidence. "
        "If fewer than 3 genuine strengths, state the limitation honestly.\n"
        "- areas_of_concern: array of 2-5 strings. Include every missing required skill. "
        "Include contradictions between documents and answers.\n"
        "- red_flags: array of strings. Missing required skills, CV/transcript contradictions, "
        "vague answers on critical questions, empty GitHub repos, unexplained gaps, identity mismatches. "
        "Empty array if none found.\n"
        "- identity_flag: string or null. Warning if CV name differs from applicant name.\n"
        + (
            "- document_interview_alignment: exactly one of: 'Strong alignment', 'Moderate alignment', "
            "'Weak alignment', 'Discrepancies found'.\n"
            if has_documents else
            "- document_interview_alignment: 'No documents submitted'\n"
        ) +
        "- recommended_follow_up_questions: array of exactly 3 strings for the human interviewer. "
        "Focus on gaps, contradictions, and unverified claims.\n"
        "- hiring_recommendation: exactly one of: Strong Yes, Yes, Maybe, No, Strong No.\n"
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user",   "content": user_prompt},
    ]

    raw_response = await _call_groq_with_retry(
        messages=messages,
        max_tokens=2500,
        temperature=0.3,
        json_mode=True,
    )

    if not raw_response:
        return None

    try:
        return json.loads(raw_response)
    except json.JSONDecodeError as error:
        logger.error(f"Failed to parse scoring response: {error}. Raw: {raw_response[:200]}")
        return None


# ── 4. Candidate notification email generation ─────────────────────────────────

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
    """
    first_name = candidate_name.split()[0] if candidate_name else "there"

    tone_structures = {
        "professional": (
            "PROFESSIONAL TONE:\n"
            "Three paragraphs, each with a clear purpose. Formal but not cold. "
            "Use the applicant's first name once at the opening only."
        ),
        "warm": (
            "WARM TONE:\n"
            "Write as an individual, not an institution. Acknowledge their effort genuinely. "
            "Conversational flow. Should feel like it came from a person who remembers the conversation."
        ),
        "direct": (
            "DIRECT TONE:\n"
            "60 to 90 words maximum. State the decision in sentence one. "
            "One reason. One next step. Sign off. No filler."
        ),
    }
    tone_guidance = tone_structures.get(tone.lower(), tone_structures["professional"])

    strengths_raw = "\n".join(f"- {s}" for s in key_strengths)   if key_strengths   else "(none provided)"
    concerns_raw  = "\n".join(f"- {c}" for c in areas_of_concern) if areas_of_concern else "(none provided)"
    summary_full  = executive_summary[:2000] if executive_summary else ""

    footer_lines = [company_name] if company_name else []
    if company_email:   footer_lines.append(company_email)
    if company_website: footer_lines.append(company_website)
    footer_text = "\n".join(footer_lines)

    if summary_full or key_strengths or areas_of_concern:
        assessment_block = (
            f"=== APPLICANT ASSESSMENT DATA ===\n"
            f"Summary: {summary_full}\n\nStrengths:\n{strengths_raw}\n\nConcerns:\n{concerns_raw}\n"
            f"=================================\n"
        )
        signal_instructions = (
            "SIGNAL EXTRACTION: Extract ONE concrete, specific signal from the assessment data. "
            "Not a category -- a specific technology, project, result, or skill. "
            "NEVER write 'assessment data does not provide'. Use the most specific thing available.\n\n"
            f"{assessment_block}"
        )
    else:
        signal_instructions = (
            "SIGNAL EXTRACTION: No assessment data available. "
            "Reference something specific about the role requirements instead.\n"
        )

    if status == "shortlisted":
        instructions = (
            f"Write a shortlist notification for {first_name} ({candidate_name}) "
            f"for {job_title} at {company_name}.\n"
            "Reference ONE specific thing from the assessment. Tell them what happens next.\n"
            "Do NOT say: 'we were impressed', 'exciting opportunity', 'you stood out'.\n\n"
            f"{signal_instructions}"
        )
    elif status == "rejected":
        instructions = (
            f"Write a rejection email for {first_name} ({candidate_name}) "
            f"for {job_title} at {company_name}.\n"
            "Be clear this is a rejection. Give ONE specific, role-based reason.\n"
            "BANNED: 'unfortunately', 'regrettably', 'not a fit', 'at this time', 'keep your CV on file'.\n"
            "Sound like a person who read their application.\n\n"
            f"{signal_instructions}"
        )
    else:  # accepted
        instructions = (
            f"Write an offer progression email for {first_name} ({candidate_name}) "
            f"for {job_title} at {company_name}.\n"
            "Confirm they have been selected. Explain next steps clearly.\n"
            "Do NOT say 'congratulations', 'we are thrilled', 'delighted'.\n\n"
            f"{signal_instructions}"
        )

    system_prompt = (
        f"You are writing a candidate notification email on behalf of {company_name}.\n\n"
        f"{tone_guidance}\n\n"
        "EMAIL STRUCTURE:\n"
        "1. Greeting: 'Dear [FirstName],'\n"
        "2. Opening: purpose of email in first sentence\n"
        "3. Body: ONE specific thing from the assessment tied to the role\n"
        "4. Next step: what happens next, specific\n"
        "5. Sign-off: 'Kind regards,' or 'Best regards,'\n"
        "6. Name: 'The Hiring Team'\n"
        f"7. Footer: {footer_text if footer_text else company_name}\n\n"
        "RULES:\n"
        "- Never use em dashes. Use commas or periods.\n"
        "- No filler. No corporate boilerplate. Sound like a sharp human.\n"
        "- Subject line: clear and direct.\n\n"
        "Return valid JSON only. No markdown.\n"
        '{"subject": "...", "body": "..."}'
    )

    user_prompt = (
        f"Applicant: {candidate_name}\n"
        f"Job: {job_title} at {company_name}\n\n"
        f"{instructions}"
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user",   "content": user_prompt},
    ]

    raw = await _call_groq_with_retry(
        messages=messages,
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
        logger.error(f"Failed to parse email response: {error}. Raw: {raw[:200]}")
        return None


# ── 5. Conversational application driver ───────────────────────────────────────

def get_first_interview_message(
    candidate_name: str,
    company_name: str,
    job_title: str,
    resumed: bool = False,
    last_ai_message: str = "",
) -> dict:
    """
    Return the hardcoded opening AI message.
    Never AI-generated to prevent hallucinations on the opening line.
    No em dashes anywhere in this message.
    """
    first_name = candidate_name.split()[0] if candidate_name else "there"
    company    = company_name.strip() if company_name else "the company"
    role       = job_title.strip()    if job_title    else "this role"

    if resumed and last_ai_message:
        last_sentence = last_ai_message.split(".")[0].strip()
        message = (
            f"Welcome back, {first_name}. We left off at: \"{last_sentence}.\" "
            f"Ready to continue?"
        )
    else:
        message = (
            f"Hi there, thanks for applying for the {role} role at {company}. "
            f"I am here to help you complete your application. "
            f"I will ask you a few questions about your background. "
            f"Just be specific and honest, there are no trick questions. "
            f"To get started, could you confirm your full name?"
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
    Generate the next AI message in a conversational application.
    The AI is a helpful application assistant, not an interrogator.
    It guides applicants through completing a thorough, honest application.

    Returns {message, action, requirement_id, requirement_label} or None on failure.
    Actions:
      'continue'     -- regular conversation
      'request_file' -- show file upload card
      'request_link' -- show link input card
      'complete'     -- application done, trigger submission flow
    """
    first_name = candidate_name.split()[0] if candidate_name else "the applicant"

    required_items    = [r for r in candidate_requirements if r.get("required")]
    optional_items    = [r for r in candidate_requirements if not r.get("required")]
    pending           = [r for r in required_items if r.get("id") not in collected_requirement_ids]
    already_collected = [r for r in required_items if r.get("id") in collected_requirement_ids]
    optional_pending  = [r for r in optional_items if r.get("id") not in collected_requirement_ids]

    pending_lines = (
        "\n".join(f"  - {r['label']} ({'file upload' if r.get('type') == 'file' else 'link'}) [id: {r['id']}]"
                  for r in pending)
        or "None -- all required items collected."
    )
    optional_lines = (
        "\n".join(f"  - {r['label']} ({'file upload' if r.get('type') == 'file' else 'link'}) [id: {r['id']}] -- optional"
                  for r in optional_pending)
        or "None."
    )
    collected_lines = (
        "\n".join(f"  OK {r['label']}" for r in already_collected)
        or "None yet."
    )

    candidate_turn_count = sum(1 for m in conversation if m.get("role") == "candidate")

    skills_text    = ", ".join(skills) if skills else "see job description"
    seniority_text = experience_level.replace("_", " ").title() if experience_level and experience_level != "any" else "Not specified"
    dept_line      = f"Department: {department}\n" if department else ""

    # Build dynamic prompt sections up front to avoid inline + operator bugs
    questions_list = pre_generated_questions or []

    if questions_list:
        role_questions_section = (
            "ROLE QUESTIONS WITH SEVERITY SETTINGS\n"
            "These are the questions to cover. Each has a severity level. Execute them EXACTLY as instructed:\n\n"
            + "\n".join(
                f"  [{q.get('severity', 'standard').upper()}] {q.get('question', '')}"
                for q in questions_list
                if q.get("question")
            )
            + "\n\n"
        )
    else:
        role_questions_section = "Role-relevant questions: ask about their background, experience, and fit for the role.\n\n"

    has_knockouts = any(q.get("knockout_enabled") for q in questions_list)
    if has_knockouts:
        knockout_section = (
            "KNOCKOUT / SCREENING QUESTIONS -- ask these FIRST, before any role questions:\n"
            + "\n".join(
                f"  [KNOCKOUT] {q.get('question', '')} "
                f"(reject if: {q.get('knockout_rejection_reason', 'threshold not met')})"
                for q in questions_list
                if q.get("knockout_enabled")
            )
            + "\n\n"
            "Ask each knockout question once. It is a SURFACE question. "
            "Do not probe. Accept the answer and move on. "
            "The system handles auto-rejection -- you just need to collect the answer clearly.\n\n"
        )
    else:
        knockout_section = ""

    system_prompt = (
        f"You are a professional application assistant at {company_name}. "
        f"You are warm, helpful, and clear. Your job is to guide applicants through completing "
        f"a thorough application for the {job_title} role. You are not an interrogator. "
        f"You are not trying to trick anyone. You are helping them put their best case forward "
        f"while collecting everything the hiring team needs to make a good decision.\n\n"

        f"---\n\n"
        f"THE ROLE\n"
        f"Title: {job_title}\n"
        f"Company: {company_name}\n"
        f"{dept_line}"
        f"Seniority: {seniority_text}\n"
        f"Key skills: {skills_text}\n"
        f"Job description: {job_description[:2000]}\n\n"

        f"---\n\n"
        f"APPLICANT\n"
        f"Full name: {candidate_name}\n"
        f"Address as '{first_name}' at most once every 5 messages. Keep it natural.\n\n"

        f"---\n\n"
        "WHAT YOU MUST COLLECT\n"
        "Collect all of the following before closing. Never re-ask anything already answered.\n\n"
        "Personal details (collect in order, one at a time):\n"
        "  1. Full name\n"
        "  2. Email address\n"
        "  3. Phone number\n"
        "  4. Current location\n"
        "  5. Current employment status\n\n"
        + role_questions_section
        + knockout_section
        + "SEVERITY EXECUTION RULES -- follow these exactly:\n"
        "  SURFACE: Ask the question once. Accept any answer, even brief. Move on immediately. No follow-ups.\n"
        "  STANDARD: If the answer is vague or thin, ask one follow-up for more specificity. "
        "Frame it helpfully: 'Could you walk me through a specific example of that?' Then accept and move on.\n"
        "  DEEP: This is the most important question. Probe until you get something specific and real. "
        "If the answer is vague: ask for a concrete example. If still vague: ask about a specific situation. "
        "If still vague after 3 attempts: note it and move on. "
        "Never accept 'I am good at X' for a DEEP question -- you need evidence.\n\n"
        f"Required documents still pending (collect ALL before closing):\n{pending_lines}\n"
        f"Optional documents (ask once at a natural moment -- never force):\n{optional_lines}\n"
        f"Already collected:\n{collected_lines}\n\n"

        "---\n\n"
        "DOCUMENT COLLECTION\n"
        "Do not wait until the end. Request documents at the smartest moment in the conversation.\n"
        "Never batch-request multiple documents in one message.\n"
        "After a document is received, acknowledge briefly and continue.\n"
        "Optional documents: ask once. If declined or no response, accept immediately. 'No problem at all.' Move on.\n"
        "Required documents: if not provided after two gentle asks, say 'Noted, we may follow up separately.' Move on.\n"
        "Accepted formats for any document: PDF, Word, images. Never reject based on file format.\n\n"

        "---\n\n"
        "QUESTION QUALITY\n"
        "Ask questions that are specific to this exact role. Never ask generic questions "
        "that could apply to any job. Every question should feel earned from what the applicant just said.\n\n"
        "When an applicant gives a vague answer, ask one follow-up for more specificity. "
        "Frame it as curiosity and helpfulness, not pressure: 'Could you walk me through a specific example of that?' "
        "or 'Could you tell me a bit more about your role there?'\n\n"
        "When an applicant gives a strong specific answer, acknowledge it and move naturally to the next topic.\n\n"
        "If an applicant seems underqualified, continue the application professionally. Do not signal your assessment.\n\n"

        "---\n\n"
        "TONE AND STYLE\n"
        "One question per message. Never two. No sub-questions.\n"
        "Affirmations must match the content of the answer:\n"
        "  Phone/email/location: 'Got that.' or 'Noted.'\n"
        "  Good experience answer: 'That sounds like solid experience.'\n"
        "  Honest admission: 'Appreciate you being upfront about that.'\n"
        "  File received: 'Got it, thank you.'\n"
        "Banned phrases: 'Excellent!', 'Amazing!', 'Wonderful!', 'Great answer!', 'Fantastic!', "
        "'That makes sense.', 'Absolutely.', 'Of course.'\n"
        "Never repeat the same affirmation twice in a row.\n"
        "Never use em dashes. Use commas or periods.\n"
        "Never mention AI. Never break character. Never explain your process.\n\n"

        "---\n\n"
        "DATA VALIDATION\n"
        "Phone looks wrong: 'That number doesn't look quite right. Could you check it?'\n"
        "Email looks wrong: 'Could you confirm your email for me?'\n"
        "Location too vague: 'Could you give me a more specific city or region?'\n"
        "Contradiction in their answers: 'Could you help me understand that, earlier you mentioned X?'\n\n"

        "---\n\n"
        "CLOSING\n"
        "Only close when complete: all 5 personal details collected, all role questions covered, "
        "ALL required documents received.\n"
        f"Closing message exactly: 'That is everything I need. Thank you for your time and for "
        f"applying to {company_name}. The team will be in touch if your application is selected to move forward.'\n"
        "Then set action to 'complete'. Never close early.\n\n"

        f"Turn count: {candidate_turn_count}\n\n"

        "---\n\n"
        "OUTPUT FORMAT\n"
        "Valid JSON only. No markdown. No preamble.\n"
        '{"message": "...", "action": "continue | request_file | request_link | complete", '
        '"requirement_id": null, "requirement_label": null}'
    )

    # Build OpenAI-format messages from conversation history.
    # Groq requires the first non-system message to be "user".
    # If the conversation starts with an AI greeting, prepend a dummy user turn.
    groq_messages: list[dict] = [{"role": "system", "content": system_prompt}]

    first_role = conversation[0].get("role") if conversation else None
    if not conversation or first_role == "ai":
        groq_messages.append({"role": "user", "content": "Ready."})

    for msg in conversation:
        role    = msg.get("role", "")
        content = msg.get("content", "")
        if role == "ai":
            groq_messages.append({"role": "assistant", "content": content})
        elif role == "candidate":
            groq_messages.append({"role": "user", "content": content})

    raw = await _call_groq_with_retry(
        messages=groq_messages,
        max_tokens=600,
        temperature=0.75,
        json_mode=True,
    )

    if not raw:
        return None

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as error:
        logger.error(f"Failed to parse conversation response: {error}. Raw: {raw[:200]}")
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
