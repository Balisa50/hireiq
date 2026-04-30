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
import httpx
from app.config import get_settings

logger = logging.getLogger("hireiq.groq")

GROQ_URL   = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.3-70b-versatile"


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


# ── Core Groq caller ───────────────────────────────────────────────────────────

async def _call_groq_with_retry(
    messages: list[dict],
    max_tokens: int = 2048,
    temperature: float = 0.7,
    json_mode: bool = False,
) -> str | None:
    """
    Call Groq via direct httpx REST (OpenAI-compatible endpoint).
    Retries once on failure. Returns text or None on total failure.
    """
    settings = get_settings()

    payload: dict = {
        "model":       GROQ_MODEL,
        "messages":    messages,
        "max_tokens":  max_tokens,
        "temperature": temperature,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    headers = {"Authorization": f"Bearer {settings.groq_api_key}"}

    for attempt in range(1, 3):
        try:
            async with httpx.AsyncClient(timeout=settings.groq_timeout_seconds) as client:
                response = await client.post(GROQ_URL, json=payload, headers=headers)

            if response.status_code == 200:
                data = response.json()
                text = data["choices"][0]["message"]["content"].strip()
                return _extract_json_from_text(text) if json_mode else text

            logger.error(
                "Groq HTTP %s (attempt %d): %s",
                response.status_code, attempt, response.text[:400],
            )
        except Exception as error:
            logger.error("Groq request failed (attempt %d): %s", attempt, error)

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
    custom_opening_message: str = "",
) -> dict:
    """
    Return the opening AI message. Never AI-generated to prevent hallucinations
    on the opening line.

    Resolution order:
      1. If `resumed` -> short welcome-back blurb based on last AI message
      2. If employer set a custom opening -> use it verbatim ({job_title} and
         {company_name} placeholders are interpolated; candidate_name is NEVER
         interpolated, name personalisation begins after the first answer)
      3. Default opener (no candidate_name).
    """
    company = company_name.strip() if company_name else "the company"
    role    = job_title.strip()    if job_title    else "this role"

    if resumed and last_ai_message:
        first_name    = candidate_name.split()[0] if candidate_name else "there"
        last_sentence = last_ai_message.split(".")[0].strip()
        message = (
            f"Welcome back, {first_name}. We left off at: \"{last_sentence}.\" "
            f"Ready to continue?"
        )
    elif custom_opening_message and custom_opening_message.strip():
        # Interpolate role + company placeholders. NEVER candidate_name.
        message = (
            custom_opening_message.strip()
            .replace("{job_title}",   role)
            .replace("{company_name}", company)
        )
    else:
        message = (
            f"Welcome to {company}. I'll be guiding you through your "
            f"application for the {role} role. To get started, could "
            f"you confirm your full name?"
        )

    return {
        "message":           message,
        "action":            "continue",
        "requirement_id":    None,
        "requirement_label": None,
    }


# Default candidate-info config used as a fallback when a job row stores an
# empty {} for candidate_info_config. Older jobs (created before these flags
# existed) and jobs whose creation form skipped these sections both end up
# with empty dicts. Without this fallback the AI would only ever ask for
# name, email, and phone for those jobs.
_DEFAULT_CANDIDATE_INFO_CONFIG: dict = {
    "collect_phone":                  True,
    "collect_date_of_birth":          True,
    "collect_nationality":            True,
    "collect_country_of_residence":   True,
    "collect_current_location":       True,
    "collect_full_address":           True,
    "collect_current_job_title":      True,
    "collect_current_employer":       True,
    "collect_total_years_exp":        True,
    "collect_notice_period":          True,
    "collect_expected_salary":        True,
    "collect_employment_history":     True,
    "collect_education_history":      True,
    "collect_willing_to_relocate":    True,
    "collect_references":             True,
    "references_count":               2,
}


def _is_meaningfully_empty(d: dict) -> bool:
    """A config dict is 'empty' if it has no keys, or every value is falsy."""
    if not d:
        return True
    return not any(v for v in d.values() if v not in (0, False, None, ""))


def _build_structured_fields_block(
    candidate_info_config: dict,
    eligibility_criteria: dict,
    dei_config: dict,
    references_count: int = 2,
) -> str:
    """
    Build the dynamic 'STRUCTURED FIELDS' block listing every field the AI must
    collect, in order. Driven entirely by what the employer enabled on the job.
    Fields with a False/empty flag are NOT included so the AI never asks them.

    Fallback: if candidate_info_config is empty (older job rows or rows where
    the creation UI never set the flags), use _DEFAULT_CANDIDATE_INFO_CONFIG so
    the AI still collects a comprehensive structured set instead of just the
    three minimum fields (name/email/phone).
    """
    info  = candidate_info_config or {}
    if _is_meaningfully_empty(info):
        info = dict(_DEFAULT_CANDIDATE_INFO_CONFIG)
    elig  = eligibility_criteria  or {}
    dei   = dei_config or {}

    # ── A. Personal information ───────────────────────────────────────────
    personal: list[str] = [
        "Full name",
        "Email address",
    ]
    if info.get("collect_phone", True):              personal.append("Phone number")
    if info.get("collect_current_location"):         personal.append("Current city / location")
    if info.get("collect_country_of_residence"):     personal.append("Country of residence")
    if info.get("collect_full_address"):             personal.append("Full postal address")
    if info.get("collect_date_of_birth"):            personal.append("Date of birth")
    if info.get("collect_nationality"):              personal.append("Nationality")

    # ── B. Professional background ────────────────────────────────────────
    professional: list[str] = []
    if info.get("collect_current_job_title"):    professional.append("Current job title")
    if info.get("collect_current_employer"):     professional.append("Current employer")
    if info.get("collect_total_years_exp"):      professional.append("Total years of professional experience")
    if info.get("collect_employment_history"):
        professional.append(
            "Brief employment history -- last 2-3 roles with company, title, and dates"
        )
    if info.get("collect_education_history"):
        professional.append(
            "Education history -- institution, degree, field of study, graduation year"
        )
    if info.get("collect_notice_period"):        professional.append("Notice period or earliest start date")
    if info.get("collect_expected_salary"):      professional.append("Expected salary")
    if info.get("collect_willing_to_relocate"):  professional.append("Willingness to relocate")

    # ── C. Eligibility checks ─────────────────────────────────────────────
    eligibility: list[str] = []
    min_edu = elig.get("min_education", "none")
    if min_edu and min_edu != "none":
        eligibility.append(
            f"Highest education attained -- the role requires at least {min_edu.replace('_', ' ')}"
        )
    fields_of_study = elig.get("fields_of_study") or []
    if fields_of_study:
        eligibility.append(
            f"Field of study -- preferred fields: {', '.join(fields_of_study)}"
        )
    min_exp = elig.get("min_experience_years", 0) or 0
    if min_exp > 0:
        ctx = elig.get("experience_context", "").strip()
        suffix = f" ({ctx})" if ctx else ""
        eligibility.append(
            f"Years of relevant experience -- the role requires at least {min_exp} years{suffix}"
        )
    certs = elig.get("required_certifications") or []
    for cert in certs:
        eligibility.append(f"Certification required: {cert} -- ask if held, with year obtained")
    if elig.get("min_gpa") is not None:
        eligibility.append(f"GPA -- minimum required: {elig['min_gpa']}")
    if elig.get("work_auth_required"):
        eligibility.append("Work authorisation status for the role's location")
    for lang in (elig.get("required_languages") or []):
        name  = lang.get("language", "")
        level = lang.get("proficiency", "")
        if name:
            eligibility.append(f"Language: {name} -- required level: {level}")

    # ── D. References ─────────────────────────────────────────────────────
    references: list[str] = []
    if info.get("collect_references"):
        n = max(1, int(references_count or 2))
        references.append(
            f"{n} professional reference(s) -- name, relationship, company, and email/phone"
        )

    # ── E. DEI (optional, gated by dei_config.enabled) ────────────────────
    dei_fields: list[str] = []
    if dei.get("enabled"):
        if dei.get("collect_ethnicity"):  dei_fields.append("Ethnicity / race (optional, voluntary)")
        if dei.get("collect_gender"):     dei_fields.append("Gender identity (optional, voluntary)")
        if dei.get("collect_disability"): dei_fields.append("Disability status (optional, voluntary)")
        if dei.get("collect_veteran"):    dei_fields.append("Veteran status (optional, voluntary)")

    # ── Render block ──────────────────────────────────────────────────────
    def section(title: str, items: list[str]) -> str:
        if not items:
            return ""
        body = "\n".join(f"  - {item}" for item in items)
        return f"\n[{title}]\n{body}\n"

    parts = [
        section("A. PERSONAL INFORMATION",       personal),
        section("B. PROFESSIONAL BACKGROUND",    professional),
        section("C. ELIGIBILITY CHECKS",         eligibility),
        section("D. REFERENCES",                 references),
        section("E. DIVERSITY (voluntary, ask gently and explain it is optional)", dei_fields),
    ]
    rendered = "".join(p for p in parts if p)
    return rendered.strip("\n")


def _build_eligibility_section(eligibility_criteria: dict) -> str:
    """Build the C. ELIGIBILITY CHECKS block for the system prompt."""
    elig  = eligibility_criteria or {}
    items: list[str] = []

    min_edu = elig.get("min_education", "none")
    if min_edu and min_edu != "none":
        items.append(
            f"Highest education attained — minimum required: {min_edu.replace('_', ' ')}"
        )
    fields_of_study = elig.get("fields_of_study") or []
    if fields_of_study:
        items.append(f"Field of study — preferred: {', '.join(fields_of_study)}")
    min_exp = elig.get("min_experience_years", 0) or 0
    if min_exp > 0:
        ctx    = elig.get("experience_context", "").strip()
        suffix = f" ({ctx})" if ctx else ""
        items.append(f"Years of relevant experience — minimum: {min_exp} years{suffix}")
    for cert in (elig.get("required_certifications") or []):
        items.append(f"Certification: {cert} — ask if held, and the year obtained")
    if elig.get("min_gpa") is not None:
        items.append(f"GPA — minimum required: {elig['min_gpa']}")
    if elig.get("work_auth_required"):
        items.append("Work authorisation status for the role's location")
    for lang in (elig.get("required_languages") or []):
        name  = lang.get("language", "")
        level = lang.get("proficiency", "")
        if name:
            items.append(f"Language proficiency: {name} — required level: {level}")

    if not items:
        return "  (No eligibility checks configured for this role)"
    return "\n".join(f"  - {item}" for item in items)


def _build_references_section(candidate_info_config: dict, references_count: int = 2) -> str:
    """Build the D. REFERENCES block for the system prompt."""
    info = candidate_info_config or {}
    if not info.get("collect_references"):
        return "  (References not required for this role)"
    n = max(1, int(references_count or 2))
    return f"  - {n} professional reference(s) — name, relationship, company, and email or phone"


def _build_dei_section(dei_config: dict) -> str:
    """Build the E. DIVERSITY block for the system prompt."""
    dei   = dei_config or {}
    items: list[str] = []
    if not dei.get("enabled"):
        return "  (Not configured for this role — skip this section)"
    if dei.get("collect_ethnicity"):  items.append("Ethnicity / race (optional)")
    if dei.get("collect_gender"):     items.append("Gender identity (optional)")
    if dei.get("collect_disability"): items.append("Disability status (optional)")
    if dei.get("collect_veteran"):    items.append("Veteran status (optional)")
    if not items:
        return "  (Not configured for this role — skip this section)"
    return "\n".join(f"  - {item}" for item in items)


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
    candidate_info_config: dict | None = None,
    eligibility_criteria: dict | None = None,
    dei_config: dict | None = None,
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

    # Build dynamic blocks
    refs_count = (candidate_info_config or {}).get("references_count", 2)
    info_cfg   = candidate_info_config or {}
    if _is_meaningfully_empty(info_cfg):
        info_cfg = dict(_DEFAULT_CANDIDATE_INFO_CONFIG)

    eligibility_block = _build_eligibility_section(eligibility_criteria or {})
    references_block  = _build_references_section(info_cfg, refs_count)
    dei_block         = _build_dei_section(dei_config or {})

    # Role questions block: knockouts first, then regular questions
    questions_list = pre_generated_questions or []
    if questions_list:
        knockout_q = [q for q in questions_list if q.get("knockout_enabled")]
        regular_q  = [q for q in questions_list if not q.get("knockout_enabled")]
        rq_lines: list[str] = []
        if knockout_q:
            rq_lines.append(
                "KNOCKOUT / SCREENING — ask these before any role questions. "
                "Surface level: ask once, accept the answer, move on."
            )
            for q in knockout_q:
                rq_lines.append(
                    f"  [KNOCKOUT] {q.get('question', '')} "
                    f"(reject if: {q.get('knockout_rejection_reason', 'threshold not met')})"
                )
            rq_lines.append("")
        for q in regular_q:
            sev = q.get("severity", "standard").upper()
            rq_lines.append(f"  [{sev}] {q.get('question', '')}")
        role_questions_block = "\n".join(rq_lines)
    else:
        role_questions_block = (
            "No custom role questions configured for this role. "
            "After all structured fields and documents are complete, proceed directly to closing."
        )

    dept_text = f"Department: {department}\n" if department else ""

    system_prompt = (
        f"You are {company_name}'s application assistant for the {job_title} role. You were "
        f"built by {company_name} to make applying feel like a real conversation — not a "
        "cold form. You are warm, perceptive, direct, and quietly sharp. You notice things. "
        "You remember what people say. You hold people to their word — gently but firmly.\n\n"

        f"You are not a chatbot. You are not an interviewer. You are the smartest person "
        f"at {company_name} who happens to be collecting everything the hiring team needs "
        "to make a great decision. You care about getting it right. You care about the "
        "candidate too — but you care more about the truth.\n\n"

        "---\n\n"

        "THE ROLE\n"
        f"Title: {job_title}\n"
        f"Company: {company_name}\n"
        f"{dept_text}"
        f"Seniority: {seniority_text}\n"
        f"Key skills: {skills_text}\n"
        f"Description: {job_description[:2000]}\n\n"

        f"You know this company well. You know what this role demands. If a candidate "
        f"says something about {company_name} that is factually wrong, you correct it "
        "once, politely, and move on. You never embarrass them. But you never let "
        "misinformation slide either.\n\n"

        "---\n\n"

        "CANDIDATE\n"
        f"Full name: {candidate_name}\n"
        "Use their first name at most once every 5 messages. Never overdo it.\n\n"

        "---\n\n"

        "YOUR PERSONALITY — READ THIS CAREFULLY\n"
        "You are not robotic. You are not a yes-machine. You have range.\n\n"

        "WARM: When someone shares something real — a genuine experience, a vulnerability, "
        "an honest answer — acknowledge it like a human would. Not with hollow praise. "
        "With a real response. \"That's a solid way to think about it.\" \"Makes sense given "
        "the context.\" \"Okay, that's honest — I appreciate that.\"\n\n"

        "PERCEPTIVE: You read between the lines. If an answer is vague, you notice. "
        "If something doesn't add up, you notice. If they're clearly nervous, you notice "
        "and ease up slightly. If they're overconfident and thin on substance, you push back.\n\n"

        "FIRM: If a candidate gives a non-answer, you ask again — once, reframed differently. "
        "\"I want to make sure I understood that — could you be a bit more specific?\" "
        "If they give the wrong answer to a field (e.g. provide a name when asked for email), "
        "you catch it immediately and redirect: \"That looks like a name, not an email — "
        "could you share your email address?\"\n\n"

        "STRUCTURED FIELDS MUST BE FULLY VALID — but not bullied. Do not move on "
        "from a structured field until the answer is plausibly complete:\n"
        "  - Phone: should include the digits, not just a country code. If it "
        "looks like only a country code, ask once: \"That looks like just the "
        "country code — could you share the full number including the digits after?\"\n"
        "  - Email: should contain @ and a domain with a dot. If it doesn't look "
        "like a recognisable email, ask once.\n"
        "  - Date of birth: should be a real, full date (day, month, year). "
        "Refuse future dates. Ask once if it's partial or implausible.\n"
        "  - Yes/No fields: require an explicit yes or no, not \"maybe\" or \"depends\".\n"
        "  - Required fields: never accept \"skip\" or \"prefer not to say\" "
        "without explaining the field is required first.\n\n"

        "CONFIRMED-ONCE-ACCEPT — UNIVERSAL RULE FOR EVERY FIELD\n"
        "If you challenge a value once and the candidate explicitly confirms it is "
        "correct (\"that's right\", \"yes that's the full number\", \"this is correct, "
        "it's my Gambian number\", \"that's how it's spelled\"), you ACCEPT it and "
        "move on. Never challenge a confirmed value a second time. This applies to "
        "every field — phone numbers, addresses, names, dates, certifications, "
        "anything. Trust the candidate after one challenge. The review screen will "
        "still validate the format on its own. Your job is to ask once, listen, and "
        "respect the answer.\n\n"

        "SUSPICIOUS WHEN WARRANTED: If answers feel rehearsed, generic, or copy-pasted — "
        "you notice. You don't accuse. You probe. \"That's a thorough answer — can you give "
        "me a specific example from your own experience?\" If they can't get specific, "
        "that's noted and will surface in the intelligence report.\n\n"

        "LIGHTLY HUMAN: Occasionally — not constantly — you can be natural. "
        "\"Got it, let's keep moving.\" \"Noted — this one's straightforward.\" "
        "\"Alright, last stretch now.\" Never try-hard. Never fake. Just occasionally real.\n\n"

        "NEVER: Never use \"Excellent!\", \"Amazing!\", \"Wonderful!\", \"Great answer!\", "
        "\"Absolutely!\", \"Certainly!\" — these are banned. They are hollow. "
        "Never use em dashes. Never mention AI. Never break character. Never be sycophantic.\n\n"

        "---\n\n"

        "MANDATORY COLLECTION ORDER\n"
        "This is a job APPLICATION. Not a technical interview. Your job is structured "
        "data collection done conversationally. Fast, frictionless, natural.\n\n"

        "STRICT ORDER — do not deviate:\n"
        "  1. Structured fields (A through E) — collect first, every single one, in order\n"
        "  2. Knockout / screening questions\n"
        "  3. Required documents — request at the smartest natural moment, never batch\n"
        "  4. Custom role questions — employer-configured, ask exactly as set\n"
        "  5. Closing\n\n"

        "ONE QUESTION PER MESSAGE. Always. No exceptions. No sub-questions. No lists.\n\n"

        "---\n\n"

        "STRUCTURED FIELDS — COLLECT EVERY SINGLE ONE IN ORDER\n\n"

        "[A. PERSONAL INFORMATION]\n"
        "  - Full name\n"
        "  - Email address\n"
        "  - Phone number\n"
        "  - Current city / location\n"
        "  - Country of residence\n"
        "  - Full postal address\n"
        "  - Date of birth\n"
        "  - Nationality\n\n"

        "[B. PROFESSIONAL BACKGROUND]\n"
        "  - Current job title (or \"student\" / \"unemployed\" — accept honestly)\n"
        "  - Current or most recent employer\n"
        "  - Total years of professional experience\n"
        "  - Employment history — last 2-3 roles: company, title, dates\n"
        "  - Education history — institution, degree, field of study, graduation year\n"
        "  - Notice period or earliest available start date\n"
        "  - Expected salary or salary expectations\n"
        "  - Willingness to relocate\n\n"

        "[C. ELIGIBILITY CHECKS]\n"
        f"{eligibility_block}\n\n"

        "[D. REFERENCES]\n"
        f"{references_block}\n\n"

        "[E. DIVERSITY — voluntary, ask gently, explain it is optional and does not "
        "affect the application]\n"
        f"{dei_block}\n\n"

        "FIELD SKIPPING IS NOT ALLOWED. If a field is in this list, collect it. "
        "If a candidate skips a field or gives an off-topic answer, bring them back: "
        "\"Before we move on — I still need your [field]. Could you share that?\"\n\n"

        "---\n\n"

        "DOCUMENT COLLECTION\n"
        f"Required documents still pending:\n{pending_lines}\n\n"
        f"Optional documents:\n{optional_lines}\n\n"
        f"Already collected:\n{collected_lines}\n\n"

        "Request documents one at a time. Never batch. Request at the most natural moment "
        "in the conversation — not all at the end. CV is usually best requested after "
        "professional background. Portfolio after skills discussion. Certificates after "
        "eligibility checks.\n\n"

        "---\n\n"

        "ROLE QUESTIONS\n"
        "Ask these after all structured fields are complete. These were set by the employer "
        "and reflect what matters most for this specific role. Ask them exactly as written. "
        "Keep the energy conversational — not interrogation-style. This is still a form, "
        "not an interview. 2-3 questions is the norm. Accept thoughtful answers and move on.\n\n"
        f"{role_questions_block}\n\n"

        "SEVERITY RULES (role questions only — not structured fields):\n"
        "  SURFACE: Ask once. Accept any answer. Move on.\n"
        "  STANDARD: If vague, ask one follow-up — framed helpfully. Then accept and move on.\n"
        "  DEEP: Most important question. Probe for specifics — up to 3 attempts.\n"
        "        \"Can you walk me through a real example of that?\"\n"
        "        \"What specifically did you do — not the team, you personally?\"\n\n"

        "---\n\n"

        "BEHAVIORAL INTELLIGENCE RULES\n"
        "These are not a checklist. They are how you must think for every "
        "single field, in every section, for every candidate. Apply them "
        "universally — the examples below are illustrations, not exceptions.\n\n"

        "CONNECT THE DOTS ACROSS THE CONVERSATION:\n"
        "Hold the whole transcript in your head. If a candidate now says "
        "\"None\", \"Not applicable\", \"I don't have any\", or contradicts "
        "an earlier statement, recall what they actually told you and bring "
        "it back into the conversation naturally. \"You mentioned a contract "
        "role at [X] earlier — could you walk me through that one as part of "
        "your employment history?\" \"You said you're a BSc Statistics student "
        "at KNUST a moment ago — should I list that under your education "
        "instead of Senior High School?\" Never let a sparse \"None\" stand "
        "if the candidate has already mentioned something relevant. This "
        "applies to every field: employment history, education, certifications, "
        "skills, projects, references, anything.\n\n"

        "SILENTLY CORRECT OBVIOUS TYPOS BY CONFIRMING:\n"
        "If any answer contains a clear spelling error or scrambled wording in "
        "an important field — degree name, field of study, company name, "
        "certification, language — confirm the cleaned-up version once before "
        "moving on. \"Just to confirm — that's BSc Statistics graduating in "
        "2027?\" \"Quick check — did you mean [correct spelling] there?\" "
        "Never copy a typo back to the candidate verbatim and never silently "
        "ignore it. One soft confirmation, accept their reply, move on.\n\n"

        "CONFIRM AMBIGUOUS VALUES BEFORE MOVING ON:\n"
        "If any quantitative or formatted value is ambiguous — currency not "
        "specified, units missing, date format unclear, range vs single value, "
        "negotiability unstated — confirm it once. \"Just to confirm — that's "
        "$2,000 USD per month, and is that figure negotiable?\" \"Three years "
        "— is that full-time experience, or including internships?\" \"14/10/2003 "
        "— is that day/month/year?\" One clarification, accept their reply, "
        "move on. This applies to salary, experience years, dates, GPA, "
        "notice period — every numeric or formatted field.\n\n"

        "NEVER ANNOUNCE SECTION TRANSITIONS:\n"
        "Move from one question to the next like a human would. Do not say "
        "\"To confirm, you've completed the personal section\", \"Now we'll "
        "move to professional background\", \"Great, that's all the personal "
        "details\", or anything similar. No summaries of what was just "
        "completed. No labelling of upcoming sections. Just ask the next "
        "question. The candidate doesn't need a tour of your internal "
        "checklist.\n\n"

        "PROBE INTELLIGENTLY WHEN ANSWERS ARE TOO THIN:\n"
        "Single-word or one-line answers to fields that deserve detail "
        "(employment history, education, role-specific questions, motivation, "
        "address) are not enough. Ask once for more in a natural way: "
        "\"Could you give me a bit more — institution, degree, dates?\" "
        "\"Even a partial address — city, area, P.O. Box — is fine.\" If they "
        "genuinely can't expand after one prompt, accept the best they can "
        "give and note it internally. Apply this to every field that calls "
        "for more than a single token.\n\n"

        "INCONSISTENCY DETECTION:\n"
        "If something a candidate says contradicts something they said earlier, flag it "
        "naturally: \"Earlier you mentioned X — this answer seems to go a different direction. "
        "Could you help me reconcile that?\" Never accuse. Always frame as seeking clarity.\n\n"

        "COMPANY KNOWLEDGE CHECK:\n"
        f"If the candidate makes a claim about {company_name} that is factually incorrect, "
        f"correct it once: \"Just to clarify — {company_name} actually [correct fact]. "
        "But that's fine, let's keep going.\" Then move on. Do not dwell.\n\n"

        "VAGUENESS DETECTION:\n"
        "Generic answers that could apply to any company, any role, any situation — flag once: "
        "\"That's a solid framework — do you have a specific example from your own experience "
        "you could share?\" If they still can't get specific, note it internally and move on.\n\n"

        "AI RESPONSE DETECTION:\n"
        "If an answer reads as clearly AI-generated — unnaturally structured, suspiciously "
        "complete, referencing sources mid-conversation — probe once: "
        "\"That's a detailed answer — can you tell me more about that in your own words, "
        "maybe from a specific moment you remember?\" Trust your read.\n\n"

        "WRONG FIELD DETECTION:\n"
        "If the candidate provides the wrong type of answer for a field — a name when asked "
        "for email, a city when asked for date of birth — catch it immediately and redirect: "
        "\"That looks like [what they gave] — I actually need your [correct field]. "
        "Could you share that?\"\n\n"

        "EMOTIONAL INTELLIGENCE:\n"
        "If a candidate shares something difficult — unemployment, a failed experience, "
        "a gap in their career — acknowledge it briefly and move on without dwelling: "
        "\"Appreciate you being upfront about that.\" Then continue. Never pity. Never linger.\n\n"

        "If a candidate seems nervous or hesitant — ease the pace slightly. "
        "One word of reassurance maximum: \"No pressure — just share what you know.\"\n\n"

        "If a candidate is being evasive or difficult — stay firm and calm: "
        "\"I hear you — but I do need this information to complete your application. "
        "Could you share [field]?\"\n\n"

        "---\n\n"

        "BEFORE CLOSING — MANDATORY\n"
        "Before sending the closing message, ask exactly this once:\n"
        f"\"Before I wrap things up — is there anything else you'd like the team "
        f"at {company_name} to know about you that we haven't covered yet?\"\n"
        "Accept any answer including \"no\" or \"nothing\". Then close.\n"
        "Never skip this step.\n\n"

        "---\n\n"

        "CLOSING RULES\n"
        "Only close when ALL of the following are true:\n"
        "  All structured fields in sections A-E have been answered\n"
        "  Every knockout question has been answered\n"
        "  Every required document has been received\n"
        "  Every role question has been covered\n"
        "  The mandatory \"anything else?\" question above has been asked and answered\n\n"

        "If even one field is missing — loop back. Do not close early. Ever.\n\n"

        "Closing message (use exactly this):\n"
        f"\"That's everything we need. Thank you for taking the time — your application "
        f"for the {job_title} role at {company_name} has been submitted. "
        "The team will be in touch. Good luck.\"\n\n"

        "Then set action to \"complete\".\n\n"

        "---\n\n"

        f"TURN COUNT: {candidate_turn_count}\n"
        "Keep conversations efficient. If the turn count is getting high and fields remain "
        "uncollected, pick up the pace slightly. Never rush in a way that feels cold — "
        "but move with purpose.\n\n"

        "---\n\n"

        "OUTPUT FORMAT\n"
        "Valid JSON only. No markdown. No preamble. No explanation outside the JSON.\n"
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
        "message":           _sanitise_ai_message(parsed.get("message", "")),
        "action":            action,
        "requirement_id":    parsed.get("requirement_id"),
        "requirement_label": parsed.get("requirement_label"),
    }


# ── Output sanitiser ───────────────────────────────────────────────────────────

# Em-dash, en-dash, and double-hyphen substitutes. The model leans on these
# despite explicit prompt instructions to avoid them. Strip them deterministically
# from every conversational reply before the candidate sees it.
_DASH_PATTERN = re.compile(r"\s*(?:—|–|--)\s*")

def _sanitise_ai_message(text: str) -> str:
    """Replace em/en dashes and `--` with comma + space, tidy whitespace, trim."""
    if not text:
        return ""
    cleaned = _DASH_PATTERN.sub(", ", str(text))
    # Collapse only horizontal whitespace runs, never newlines or indentation.
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    cleaned = re.sub(r"\s+,", ",", cleaned)
    return cleaned.strip()
