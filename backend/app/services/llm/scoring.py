"""
Candidate assessment. Four-dimension scoring from the full transcript.
"""

import json
from app.services.llm.client import _call_groq_with_retry, logger
from app.services.llm.prompts import _format_candidate_context


# ── 3. Candidate scoring ────────────────────────────────────────────────────

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
