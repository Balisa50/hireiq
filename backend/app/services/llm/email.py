"""
Candidate notification email drafts.
"""

import json
from app.services.llm.client import _call_groq_with_retry, logger


# ── 4. Candidate notification email generation ──────────────────────────────

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
