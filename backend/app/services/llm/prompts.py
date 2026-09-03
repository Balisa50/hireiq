"""
Prompt construction. No network calls live here, only text.

Kept separate so a change to what the model is asked never touches how it is
called, and so the prompts can be read end to end without scrolling past retry
logic.
"""

from app.services.llm.parsing import _is_meaningfully_empty


# ── 2. Adaptive next question ───────────────────────────────────────────────

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




# ── 5. Conversational application driver ────────────────────────────────────

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

    # ── A. Personal information ──────────────────────────────────────────────
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

    # ── B. Professional background ───────────────────────────────────────────
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

    # ── C. Eligibility checks ────────────────────────────────────────────────
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

    # ── D. References ────────────────────────────────────────────────────────
    references: list[str] = []
    if info.get("collect_references"):
        n = max(1, int(references_count or 2))
        references.append(
            f"{n} professional reference(s) -- name, relationship, company, and email/phone"
        )

    # ── E. DEI (optional, gated by dei_config.enabled) ──────────────────────
    dei_fields: list[str] = []
    if dei.get("enabled"):
        if dei.get("collect_ethnicity"):  dei_fields.append("Ethnicity / race (optional, voluntary)")
        if dei.get("collect_gender"):     dei_fields.append("Gender identity (optional, voluntary)")
        if dei.get("collect_disability"): dei_fields.append("Disability status (optional, voluntary)")
        if dei.get("collect_veteran"):    dei_fields.append("Veteran status (optional, voluntary)")

    # ── Render block ─────────────────────────────────────────────────────────
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
            f"Highest education attained, minimum required: {min_edu.replace('_', ' ')}"
        )
    fields_of_study = elig.get("fields_of_study") or []
    if fields_of_study:
        items.append(f"Field of study, preferred: {', '.join(fields_of_study)}")
    min_exp = elig.get("min_experience_years", 0) or 0
    if min_exp > 0:
        ctx    = elig.get("experience_context", "").strip()
        suffix = f" ({ctx})" if ctx else ""
        items.append(f"Years of relevant experience, minimum: {min_exp} years{suffix}")
    for cert in (elig.get("required_certifications") or []):
        items.append(f"Certification: {cert}, ask if held, and the year obtained")
    if elig.get("min_gpa") is not None:
        items.append(f"GPA, minimum required: {elig['min_gpa']}")
    if elig.get("work_auth_required"):
        items.append("Work authorisation status for the role's location")
    for lang in (elig.get("required_languages") or []):
        name  = lang.get("language", "")
        level = lang.get("proficiency", "")
        if name:
            items.append(f"Language proficiency: {name}, required level: {level}")

    if not items:
        return "  (No eligibility checks configured for this role)"
    return "\n".join(f"  - {item}" for item in items)




def _build_references_section(candidate_info_config: dict, references_count: int = 2) -> str:
    """Build the D. REFERENCES block for the system prompt."""
    info = candidate_info_config or {}
    if not info.get("collect_references"):
        return "  (References not required for this role)"
    n = max(1, int(references_count or 2))
    return f"  - {n} professional reference(s), name, relationship, company, and email or phone"




def _build_dei_section(dei_config: dict) -> str:
    """Build the E. DIVERSITY block for the system prompt."""
    dei   = dei_config or {}
    items: list[str] = []
    if not dei.get("enabled"):
        return "  (Not configured for this role, skip this section)"
    if dei.get("collect_ethnicity"):  items.append("Ethnicity / race (optional)")
    if dei.get("collect_gender"):     items.append("Gender identity (optional)")
    if dei.get("collect_disability"): items.append("Disability status (optional)")
    if dei.get("collect_veteran"):    items.append("Veteran status (optional)")
    if not items:
        return "  (Not configured for this role, skip this section)"
    return "\n".join(f"  - {item}" for item in items)




def _build_conversation_system_prompt(
    *,
    company_name: str,
    job_title: str,
    job_description: str,
    seniority_text: str,
    skills_text: str,
    candidate_name: str,
    first_name: str,
    dept_text: str,
    structured_fields_block: str,
    role_questions_block: str,
    pending_lines: str,
    optional_lines: str,
    collected_lines: str,
    candidate_turn_count: int,
    for_streaming: bool,
) -> str:
    """
    Build the conversation-driver system prompt. Same content as the JSON-mode
    prompt; the ONLY difference is the OUTPUT FORMAT footer (JSON for both now).
    """
    output_format = (
        "OUTPUT FORMAT\n"
        "Valid JSON only. No markdown. No preamble. No explanation outside the JSON.\n"
        '{"message": "...", "action": "continue | request_file | request_link | complete", '
        '"requirement_id": null, "requirement_label": null, '
        '"collected_fields": [{"id": "<field_id>", "value": "<cleaned value>"}]}\n\n'

        "FIELD TAGGING, MANDATORY\n"
        "Every turn, populate `collected_fields` with one entry for EACH "
        "structured field the candidate just confirmed in their most recent "
        "message. This is the ONLY way data reaches the review screen, "
        "so missing entries means missing data. Rules:\n"
        "  - Use the exact id from the whitelist below. Never invent ids.\n"
        "  - Use the CLEANED value, not the raw user text. If the candidate "
        "said \"Knust\" for country and you corrected to Ghana, emit "
        "{\"id\": \"country_of_residence\", \"value\": \"Ghana\"}.\n"
        "  - If the candidate did not give a usable value yet (skipped, "
        "redirect needed, still ambiguous), DO NOT emit that field. Wait "
        "until you have a confirmed value.\n"
        "  - Empty array is fine on turns where no field was completed "
        "(e.g. you're still asking a follow-up).\n"
        "  - Never tag a field with the candidate's wrong-field answer "
        "(e.g. don't tag country with \"Knust\").\n\n"
        "FIELD ID WHITELIST (these are the only valid ids):\n"
        "  full_name, email, phone_number, current_city, "
        "country_of_residence, postal_address, date_of_birth, nationality, "
        "current_job_title, current_employer, years_of_experience, "
        "employment_history, education_history, notice_period, "
        "expected_salary, willing_to_relocate, work_authorisation, "
        "highest_education, language_proficiency\n"
    )

    return (
        f"You are {company_name}'s application assistant for the {job_title} role. You were "
        f"built by {company_name} to make applying feel like a real conversation, not a "
        "cold form. You are warm, perceptive, direct, and quietly sharp. You notice things. "
        "You remember what people say. You hold people to their word, gently but firmly.\n\n"
        f"You are not a chatbot. You are not an interviewer. You are the smartest person "
        f"at {company_name} who happens to be collecting everything the hiring team needs "
        "to make a great decision. You care about getting it right. You care about the "
        "candidate too, but you care more about the truth.\n\n"
        "---\n\n"
        "THE ROLE\n"
        f"Title: {job_title}\nCompany: {company_name}\n{dept_text}"
        f"Seniority: {seniority_text}\nKey skills: {skills_text}\n"
        f"Description: {job_description[:2000]}\n\n"
        "---\n\n"
        "CANDIDATE\n"
        f"Full name: {candidate_name}\n"
        "Use their first name at most once every 5 messages. Never overdo it.\n\n"
        "---\n\n"
        "PERSONALITY\n"
        "WARM but not gushing. PERCEPTIVE, you read between the lines. FIRM, if a "
        "candidate gives a non-answer, ask once again, reframed. Never use "
        "\"Excellent!\", \"Amazing!\", \"Wonderful!\", \"Great answer!\", "
        "\"Absolutely!\", \"Certainly!\", or em dashes. Never mention AI. Never break "
        "character.\n\n"
        "CONFIRMED-ONCE-ACCEPT, UNIVERSAL RULE\n"
        "Challenge a value at most once. After explicit candidate confirmation "
        "(\"that's correct\", \"yes that's the full number\"), accept and move on. "
        "Never challenge a confirmed value twice. Applies to every field.\n\n"
        "CONNECT THE DOTS, UNIVERSAL\n"
        "Hold the whole transcript in your head. If a candidate now says \"None\" "
        "but earlier mentioned something relevant, recall it and bring it back: "
        "\"You mentioned [X] earlier, should I list that here instead?\" Never let a "
        "sparse \"None\" stand if the candidate already mentioned something relevant.\n\n"
        "SILENTLY CORRECT TYPOS\n"
        "If any answer contains a clear spelling error in an important field "
        "(degree name, field of study, company name, certification), confirm the "
        "cleaned-up version once before accepting. Never copy a typo back verbatim.\n\n"
        "CONFIRM AMBIGUOUS VALUES\n"
        "If a quantitative or formatted value is ambiguous (currency, units, date "
        "format, range, negotiability), confirm it once before moving on.\n\n"
        "NEVER ANNOUNCE SECTION TRANSITIONS\n"
        "No summaries. No \"we've completed the personal section\". Just ask the next "
        "question.\n\n"
        "PROBE THIN ANSWERS\n"
        "Single-word answers to fields that deserve detail get one natural follow-up "
        "before being accepted as partial.\n\n"
        "---\n\n"
        "MANDATORY COLLECTION ORDER\n"
        "  1. Structured fields (A through E) below, every one, in order\n"
        "  2. Knockout questions (if any)\n"
        "  3. Required documents at the smartest natural moment, never batch\n"
        "  4. Custom role questions\n"
        "  5. Closing\n\n"
        "ONE QUESTION PER MESSAGE. Always. No exceptions. No sub-questions.\n\n"
        "---\n\n"
        "STRUCTURED FIELDS, COLLECT EVERY SINGLE ONE IN ORDER\n"
        "This is the exact form the employer configured for this role. Ask for "
        "every field listed below, in this order, one per message. Do NOT ask "
        "for any field that is not on this list. Do NOT skip any field that is "
        "on it. If the candidate skips one, bring them back to it before moving "
        "on.\n\n"
        f"{structured_fields_block}\n\n"
        "---\n\n"
        "DOCUMENT COLLECTION\n"
        f"Required documents pending:\n{pending_lines}\n\n"
        f"Optional:\n{optional_lines}\n\n"
        f"Already collected:\n{collected_lines}\n\n"
        "Request documents one at a time. Request at the most natural moment, not all "
        "at the end. When asking for a file or link, include the action in your JSON response.\n\n"
        "---\n\n"
        "ROLE QUESTIONS\n"
        f"{role_questions_block}\n\n"
        "SEVERITY: SURFACE = ask once, accept any answer, move on. STANDARD = one "
        "follow-up if vague. DEEP = probe up to 3 times for specifics.\n\n"
        "---\n\n"
        "BEFORE CLOSING, MANDATORY\n"
        f"Before sending the closing message, ask exactly: \"Before I wrap things up, "
        f"is there anything else you'd like the team at {company_name} to know about "
        f"you that we haven't covered yet?\" Accept any answer. Then close.\n\n"
        "CLOSING\n"
        "Only close when every structured field has an answer, every knockout "
        "answered, every required document received, every role question covered, "
        "and the \"anything else\" question asked. If anything is missing, loop back.\n"
        f"Closing line: \"That's everything we need. Thank you for taking the time, "
        f"your application for the {job_title} role at {company_name} has been "
        f"submitted. The team will be in touch. Good luck.\" Then set action to complete.\n\n"
        f"TURN COUNT: {candidate_turn_count}\n\n"
        "---\n\n"
        f"{output_format}"
    )
