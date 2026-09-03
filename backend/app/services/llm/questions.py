"""
Question generation: the interview set, a job posting draft, and single
adaptive follow-ups.
"""

import json
from app.services.llm.client import _call_groq_with_retry, logger
from app.services.llm.prompts import _format_candidate_context


# ── 1. Question generation ──────────────────────────────────────────────────

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




# ── 1b. Job pre-fill generation ────────────────────────────────────────────

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
