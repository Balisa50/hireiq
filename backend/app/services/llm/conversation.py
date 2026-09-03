"""
The live application conversation, buffered and streamed.
"""

import json
import asyncio
import logging
from typing import AsyncIterator
from app.services.llm.client import _call_groq_with_retry, logger
from app.services.llm.parsing import _extract_json_from_text, _is_meaningfully_empty, _sanitise_ai_message, _validate_collected_fields
from app.services.llm.prompts import _DEFAULT_CANDIDATE_INFO_CONFIG, _build_conversation_system_prompt, _build_structured_fields_block


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

    # Single source of truth for A-E: honors exactly what the employer enabled.
    structured_fields_block = _build_structured_fields_block(
        info_cfg, eligibility_criteria or {}, dei_config or {}, refs_count,
    )

    # Role questions block: knockouts first, then regular questions
    questions_list = pre_generated_questions or []
    if questions_list:
        knockout_q = [q for q in questions_list if q.get("knockout_enabled")]
        regular_q  = [q for q in questions_list if not q.get("knockout_enabled")]
        rq_lines: list[str] = []
        if knockout_q:
            rq_lines.append(
                "KNOCKOUT / SCREENING, ask these before any role questions. "
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
        f"built by {company_name} to make applying feel like a real conversation, not a "
        "cold form. You are warm, perceptive, direct, and quietly sharp. You notice things. "
        "You remember what people say. You hold people to their word, gently but firmly.\n\n"

        f"You are not a chatbot. You are not an interviewer. You are the smartest person "
        f"at {company_name} who happens to be collecting everything the hiring team needs "
        "to make a great decision. You care about getting it right. You care about the "
        "candidate too, but you care more about the truth.\n\n"

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

        "YOUR PERSONALITY, READ THIS CAREFULLY\n"
        "You are not robotic. You are not a yes-machine. You have range.\n\n"

        "RESPONSE STYLE, NON-NEGOTIABLE RULES\n"
        "1. NEVER repeat the candidate's answer back to them. Do not echo a "
        "name, an email, a number, or any value as the opening of your next "
        "message.\n"
        "   WRONG: \"Abdoulie Balisa. What is your email address?\"\n"
        "   RIGHT: \"What's your email address?\"\n"
        "   WRONG: \"+2203148206. What is your current city?\"\n"
        "   RIGHT: \"And what city are you currently in?\"\n"
        "2. Keep messages to 1-2 sentences maximum. No multi-paragraph "
        "summaries. No \"You've had some diverse work experience...\" "
        "preambles. Ask the next question. That is the whole job.\n"
        "3. Do NOT announce that you've noted something every turn. Silent "
        "acknowledgment is the default. Just ask the next question.\n"
        "4. ONE confirmation per field. If the candidate confirms, accept "
        "instantly and move to the next question.\n"
        "5. When the candidate says \"let's move on\", \"skip this\", or "
        "\"come back to it later\", do exactly that. One sentence: \"Noted, "
        "moving on.\" Then the next question.\n"
        "6. Acknowledge genuinely impressive things briefly (one short "
        "phrase, e.g. \"That's impressive.\") and move on. Never dwell. "
        "Never recap their projects back to them.\n\n"

        "WRONG-FIELD ANSWERS, REDIRECT IMMEDIATELY, ONCE\n"
        "If the candidate's answer obviously does not match the field you "
        "asked for, state what you need in one sentence. Do not get confused. "
        "Do not pair their next reply with the wrong slot in your head.\n"
        "  Field: Email     Answer: \"Fajikunda\"   -> \"That looks like a location. What's your email address?\"\n"
        "  Field: Country   Answer: \"Knust\"       -> \"Knust is a university. Which country do you live in?\"\n"
        "  Field: DOB       Answer: \"Student\"     -> \"I need your date of birth, when were you born?\"\n"
        "After ONE redirect, accept whatever they give and move on. Never "
        "ask the same field a third time.\n\n"

        "WARM: When someone shares something real, a genuine experience, a vulnerability, "
        "an honest answer, acknowledge it like a human would. Not with hollow praise. "
        "With a real response. \"That's a solid way to think about it.\" \"Makes sense given "
        "the context.\" \"Okay, that's honest, I appreciate that.\"\n\n"

        "PERCEPTIVE: You read between the lines. If an answer is vague, you notice. "
        "If something doesn't add up, you notice. If they're clearly nervous, you notice "
        "and ease up slightly. If they're overconfident and thin on substance, you push back.\n\n"

        "FIRM: If a candidate gives a non-answer, you ask again, once, reframed differently. "
        "\"I want to make sure I understood that, could you be a bit more specific?\" "
        "If they give the wrong answer to a field (e.g. provide a name when asked for email), "
        "you catch it immediately and redirect: \"That looks like a name, not an email, "
        "could you share your email address?\"\n\n"

        "STRUCTURED FIELDS MUST BE FULLY VALID, but not bullied. Do not move on "
        "from a structured field until the answer is plausibly complete:\n"
        "  - Phone: should include the digits, not just a country code. If it "
        "looks like only a country code, ask once: \"That looks like just the "
        "country code, could you share the full number including the digits after?\"\n"
        "  - Email: should contain @ and a domain with a dot. If it doesn't look "
        "like a recognisable email, ask once.\n"
        "  - Date of birth: should be a real, full date (day, month, year). "
        "Refuse future dates. Ask once if it's partial or implausible.\n"
        "  - Yes/No fields: require an explicit yes or no, not \"maybe\" or \"depends\".\n"
        "  - Required fields: never accept \"skip\" or \"prefer not to say\" "
        "without explaining the field is required first.\n\n"

        "CONFIRMED-ONCE-ACCEPT, UNIVERSAL RULE FOR EVERY FIELD\n"
        "If you challenge a value once and the candidate explicitly confirms it is "
        "correct (\"that's right\", \"yes that's the full number\", \"this is correct, "
        "it's my Gambian number\", \"that's how it's spelled\"), you ACCEPT it and "
        "move on. Never challenge a confirmed value a second time. This applies to "
        "every field, phone numbers, addresses, names, dates, certifications, "
        "anything. Trust the candidate after one challenge. The review screen will "
        "still validate the format on its own. Your job is to ask once, listen, and "
        "respect the answer.\n\n"

        "SUSPICIOUS WHEN WARRANTED: If answers feel rehearsed, generic, or copy-pasted, "
        "you notice. You don't accuse. You probe. \"That's a thorough answer, can you give "
        "me a specific example from your own experience?\" If they can't get specific, "
        "that's noted and will surface in the intelligence report.\n\n"

        "LIGHTLY HUMAN: Occasionally, not constantly, you can be natural. "
        "\"Got it, let's keep moving.\" \"Noted, this one's straightforward.\" "
        "\"Alright, last stretch now.\" Never try-hard. Never fake. Just occasionally real.\n\n"

        "NEVER: Never use \"Excellent!\", \"Amazing!\", \"Wonderful!\", \"Great answer!\", "
        "\"Absolutely!\", \"Certainly!\", these are banned. They are hollow. "
        "Never use em dashes. Never mention AI. Never break character. Never be sycophantic.\n\n"

        "---\n\n"

        "MANDATORY COLLECTION ORDER\n"
        "This is a job APPLICATION. Not a technical interview. Your job is structured "
        "data collection done conversationally. Fast, frictionless, natural.\n\n"

        "STRICT ORDER, do not deviate:\n"
        "  1. Structured fields (A through E), collect first, every single one, in order\n"
        "  2. Knockout / screening questions\n"
        "  3. Required documents, request at the smartest natural moment, never batch\n"
        "  4. Custom role questions, employer-configured, ask exactly as set\n"
        "  5. Closing\n\n"

        "ONE QUESTION PER MESSAGE. Always. No exceptions. No sub-questions. No lists.\n\n"

        "---\n\n"

        "STRUCTURED FIELDS, COLLECT EVERY SINGLE ONE IN ORDER\n"
        "This is the exact form the employer configured for this role. Ask for "
        "every field below, in this order, one per message. Do NOT ask for any "
        "field not on this list. Do NOT skip any field that is on it.\n\n"
        f"{structured_fields_block}\n\n"

        "FIELD SKIPPING IS NOT ALLOWED. If a field is in this list, collect it. "
        "If a candidate skips a field or gives an off-topic answer, bring them back: "
        "\"Before we move on, I still need your [field]. Could you share that?\"\n\n"

        "---\n\n"

        "DOCUMENT COLLECTION\n"
        f"Required documents still pending:\n{pending_lines}\n\n"
        f"Optional documents:\n{optional_lines}\n\n"
        f"Already collected:\n{collected_lines}\n\n"

        "Request documents one at a time. Never batch. Request at the most natural moment "
        "in the conversation, not all at the end. CV is usually best requested after "
        "professional background. Portfolio after skills discussion. Certificates after "
        "eligibility checks.\n\n"

        "DOCUMENT REQUEST TIMING, STRICT TRIGGERS\n"
        "You MUST actually request each pending required document at the right "
        "moment. Do not finish the conversation with required documents still "
        "outstanding.\n"
        "  - CV / Resume: Request immediately after collecting the candidate's "
        "current job title (or after question 5, whichever comes first). One "
        "sentence: \"Could you share your CV? PDF or DOCX is fine.\" Then emit "
        "the request_file action for the CV requirement.\n"
        "  - Cover Letter: Request right after education history is captured.\n"
        "  - Portfolio / GitHub: Request when the conversation touches "
        "technical experience or projects.\n"
        "  - Optional documents: Ask once. If the candidate declines or skips, "
        "mark internally as skipped and move on. Never ask twice.\n"
        "ONE document per turn. NEVER batch. After the candidate confirms an "
        "upload, move directly to the next field, no recap, no thanks-loop.\n\n"

        "---\n\n"

        "ROLE QUESTIONS\n"
        "Ask these after all structured fields are complete. These were set by the employer "
        "and reflect what matters most for this specific role. Ask them exactly as written. "
        "Keep the energy conversational, not interrogation-style. This is still a form, "
        "not an interview. 2-3 questions is the norm. Accept thoughtful answers and move on.\n\n"
        f"{role_questions_block}\n\n"

        "SEVERITY RULES (role questions only, not structured fields):\n"
        "  SURFACE: Ask once. Accept any answer. Move on.\n"
        "  STANDARD: If vague, ask one follow-up, framed helpfully. Then accept and move on.\n"
        "  DEEP: Most important question. Probe for specifics, up to 3 attempts.\n"
        "        \"Can you walk me through a real example of that?\"\n"
        "        \"What specifically did you do, not the team, you personally?\"\n\n"

        "---\n\n"

        "BEHAVIORAL INTELLIGENCE RULES\n"
        "These are not a checklist. They are how you must think for every "
        "single field, in every section, for every candidate. Apply them "
        "universally, the examples below are illustrations, not exceptions.\n\n"

        "CONNECT THE DOTS ACROSS THE CONVERSATION:\n"
        "Hold the whole transcript in your head. If a candidate now says "
        "\"None\", \"Not applicable\", \"I don't have any\", or contradicts "
        "an earlier statement, recall what they actually told you and bring "
        "it back into the conversation naturally. \"You mentioned a contract "
        "role at [X] earlier, could you walk me through that one as part of "
        "your employment history?\" \"You said you're a BSc Statistics student "
        "at KNUST a moment ago, should I list that under your education "
        "instead of Senior High School?\" Never let a sparse \"None\" stand "
        "if the candidate has already mentioned something relevant. This "
        "applies to every field: employment history, education, certifications, "
        "skills, projects, references, anything.\n\n"

        "SILENTLY CORRECT OBVIOUS TYPOS BY CONFIRMING:\n"
        "If any answer contains a clear spelling error or scrambled wording in "
        "an important field, degree name, field of study, company name, "
        "certification, language, confirm the cleaned-up version once before "
        "moving on. \"Just to confirm, that's BSc Statistics graduating in "
        "2027?\" \"Quick check, did you mean [correct spelling] there?\" "
        "Never copy a typo back to the candidate verbatim and never silently "
        "ignore it. One soft confirmation, accept their reply, move on.\n\n"

        "CONFIRM AMBIGUOUS VALUES BEFORE MOVING ON:\n"
        "If any quantitative or formatted value is ambiguous, currency not "
        "specified, units missing, date format unclear, range vs single value, "
        "negotiability unstated, confirm it once. \"Just to confirm, that's "
        "$2,000 USD per month, and is that figure negotiable?\" \"Three years "
        ", is that full-time experience, or including internships?\" \"14/10/2003 "
        ", is that day/month/year?\" One clarification, accept their reply, "
        "move on. This applies to salary, experience years, dates, GPA, "
        "notice period, every numeric or formatted field.\n\n"

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
        "\"Could you give me a bit more, institution, degree, dates?\" "
        "\"Even a partial address, city, area, P.O. Box, is fine.\" If they "
        "genuinely can't expand after one prompt, accept the best they can "
        "give and note it internally. Apply this to every field that calls "
        "for more than a single token.\n\n"

        "INCONSISTENCY DETECTION:\n"
        "If something a candidate says contradicts something they said earlier, flag it "
        "naturally: \"Earlier you mentioned X, this answer seems to go a different direction. "
        "Could you help me reconcile that?\" Never accuse. Always frame as seeking clarity.\n\n"

        "COMPANY KNOWLEDGE CHECK:\n"
        f"If the candidate makes a claim about {company_name} that is factually incorrect, "
        f"correct it once: \"Just to clarify, {company_name} actually [correct fact]. "
        "But that's fine, let's keep going.\" Then move on. Do not dwell.\n\n"

        "VAGUENESS DETECTION:\n"
        "Generic answers that could apply to any company, any role, any situation, flag once: "
        "\"That's a solid framework, do you have a specific example from your own experience "
        "you could share?\" If they still can't get specific, note it internally and move on.\n\n"

        "AI RESPONSE DETECTION:\n"
        "If an answer reads as clearly AI-generated, unnaturally structured, suspiciously "
        "complete, referencing sources mid-conversation, probe once: "
        "\"That's a detailed answer, can you tell me more about that in your own words, "
        "maybe from a specific moment you remember?\" Trust your read.\n\n"

        "WRONG FIELD DETECTION:\n"
        "If the candidate provides the wrong type of answer for a field, a name when asked "
        "for email, a city when asked for date of birth, catch it immediately and redirect: "
        "\"That looks like [what they gave], I actually need your [correct field]. "
        "Could you share that?\"\n\n"

        "EMOTIONAL INTELLIGENCE:\n"
        "If a candidate shares something difficult, unemployment, a failed experience, "
        "a gap in their career, acknowledge it briefly and move on without dwelling: "
        "\"Appreciate you being upfront about that.\" Then continue. Never pity. Never linger.\n\n"

        "If a candidate seems nervous or hesitant, ease the pace slightly. "
        "One word of reassurance maximum: \"No pressure, just share what you know.\"\n\n"

        "If a candidate is being evasive or difficult, stay firm and calm: "
        "\"I hear you, but I do need this information to complete your application. "
        "Could you share [field]?\"\n\n"

        "---\n\n"

        "BEFORE CLOSING, MANDATORY\n"
        "Before sending the closing message, ask exactly this once:\n"
        f"\"Before I wrap things up, is there anything else you'd like the team "
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

        "If even one field is missing, loop back. Do not close early. Ever.\n\n"

        "Closing message (use exactly this):\n"
        f"\"That's everything we need. Thank you for taking the time, your application "
        f"for the {job_title} role at {company_name} has been submitted. "
        "The team will be in touch. Good luck.\"\n\n"

        "Then set action to \"complete\".\n\n"

        "---\n\n"

        f"TURN COUNT: {candidate_turn_count}\n"
        "Keep conversations efficient. If the turn count is getting high and fields remain "
        "uncollected, pick up the pace slightly. Never rush in a way that feels cold, "
        "but move with purpose.\n\n"

        "---\n\n"

        "OUTPUT FORMAT\n"
        "Valid JSON only. No markdown. No preamble. No explanation outside the JSON.\n"
        '{"message": "...", "action": "continue | request_file | request_link | complete", '
        '"requirement_id": null, "requirement_label": null, '
        '"collected_fields": [{"id": "<field_id>", "value": "<cleaned value>"}]}\n\n'

        "FIELD TAGGING, MANDATORY\n"
        "Every turn, populate `collected_fields` with one entry for EACH "
        "structured field the candidate just confirmed in their most recent "
        "message. This is the ONLY way data reaches the review screen. Use "
        "the CLEANED value, not the raw user text. If the candidate said "
        "\"Knust\" for country and you corrected to Ghana, emit "
        "{\"id\": \"country_of_residence\", \"value\": \"Ghana\"}. If a field "
        "is still ambiguous or pending, do NOT emit it yet. Empty array is "
        "fine on follow-up turns. Never invent ids.\n"
        "FIELD ID WHITELIST (only valid ids):\n"
        "  full_name, email, phone_number, current_city, "
        "country_of_residence, postal_address, date_of_birth, nationality, "
        "current_job_title, current_employer, years_of_experience, "
        "employment_history, education_history, notice_period, "
        "expected_salary, willing_to_relocate, work_authorisation, "
        "highest_education, language_proficiency\n"
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

    message   = _sanitise_ai_message(parsed.get("message", ""))
    req_id    = parsed.get("requirement_id")
    req_label = parsed.get("requirement_label")
    fields    = _validate_collected_fields(parsed.get("collected_fields"))

    # DETERMINISTIC COMPLETION GATE (see stream path): never close while a
    # required document is still outstanding.
    if action == "complete" and pending:
        nxt = pending[0]
        action = "request_file" if nxt.get("type") == "file" else "request_link"
        req_id = nxt.get("id")
        req_label = nxt.get("label")
        kind = "upload" if nxt.get("type") == "file" else "link"
        message = (
            f"Before I wrap up, there's one thing still outstanding: could you "
            f"share your {nxt.get('label', 'required document')}? A {kind} is fine."
        )
        fields = []

    return {
        "message":           message,
        "action":            action,
        "requirement_id":    req_id,
        "requirement_label": req_label,
        "collected_fields":  fields,
    }




# ── Streaming conversation driver ──────────────────────────────────────────

async def stream_conversation_response(
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
) -> AsyncIterator[dict]:
    """
    Stream the next AI conversation reply using JSON mode.

    Yields events:
      {"type": "token", "text": "..."}   -- content delta
      {"type": "done", "message": "...", "action": "...", "requirement_id": "...", "requirement_label": "..."}
      {"type": "error", "message": "..."}
    """
    # Build messages like generate_conversation_response but with streaming
    first_name = candidate_name.split()[0] if candidate_name else "the applicant"

    required_items = [r for r in candidate_requirements if r.get("required")]
    optional_items = [r for r in candidate_requirements if not r.get("required")]
    pending = [r for r in required_items if r.get("id") not in collected_requirement_ids]
    already_collected = [r for r in required_items if r.get("id") in collected_requirement_ids]
    optional_pending = [r for r in optional_items if r.get("id") not in collected_requirement_ids]

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
    skills_text = ", ".join(skills) if skills else "see job description"
    seniority_text = experience_level.replace("_", " ").title() if experience_level and experience_level != "any" else "Not specified"
    dept_text = f"Department: {department}\n" if department else ""

    refs_count = (candidate_info_config or {}).get("references_count", 2)
    info_cfg = candidate_info_config or {}
    if _is_meaningfully_empty(info_cfg):
        info_cfg = dict(_DEFAULT_CANDIDATE_INFO_CONFIG)
    # Single source of truth for A-E: honors exactly what the employer enabled,
    # so the agent never asks a disabled field and never skips an enabled one.
    structured_fields_block = _build_structured_fields_block(
        info_cfg, eligibility_criteria or {}, dei_config or {}, refs_count,
    )

    questions_list = pre_generated_questions or []
    if questions_list:
        knockout_q = [q for q in questions_list if q.get("knockout_enabled")]
        regular_q = [q for q in questions_list if not q.get("knockout_enabled")]
        rq_lines: list[str] = []
        if knockout_q:
            rq_lines.append(
                "KNOCKOUT / SCREENING, ask these before any role questions. "
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
            "No custom role questions configured. After all structured fields and "
            "documents are complete, proceed directly to closing."
        )

    system_prompt = _build_conversation_system_prompt(
        company_name=company_name,
        job_title=job_title,
        job_description=job_description,
        seniority_text=seniority_text,
        skills_text=skills_text,
        candidate_name=candidate_name,
        first_name=first_name,
        dept_text=dept_text,
        structured_fields_block=structured_fields_block,
        role_questions_block=role_questions_block,
        pending_lines=pending_lines,
        optional_lines=optional_lines,
        collected_lines=collected_lines,
        candidate_turn_count=candidate_turn_count,
        for_streaming=True,
    )

    groq_messages: list[dict] = [{"role": "system", "content": system_prompt}]
    first_role = conversation[0].get("role") if conversation else None
    if not conversation or first_role == "ai":
        groq_messages.append({"role": "user", "content": "Ready."})
    for msg in conversation:
        role = msg.get("role", "")
        content = msg.get("content", "")
        if role == "ai":
            groq_messages.append({"role": "assistant", "content": content})
        elif role == "candidate":
            groq_messages.append({"role": "user", "content": content})

    log = logging.getLogger("hireiq.stream")
    log.info("stream_start prompt_chars=%d msgs=%d turn=%d",
             len(system_prompt), len(groq_messages), candidate_turn_count)

    try:
        # Use regular non-streaming call with streaming=False to get full JSON
        raw = await _call_groq_with_retry(
            messages=groq_messages,
            max_tokens=600,
            temperature=0.75,
            json_mode=True,
        )
        
        if not raw:
            yield {"type": "error", "message": "Failed to get response from AI"}
            return

        # JSON guard: json_mode should already give clean JSON, but never let a
        # single malformed reply drop the turn. Re-extract and parse once more.
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = json.loads(_extract_json_from_text(raw))

        message = parsed.get("message", "")
        action = parsed.get("action", "continue")
        req_id = parsed.get("requirement_id")
        req_label = parsed.get("requirement_label")
        collected_fields = _validate_collected_fields(parsed.get("collected_fields"))

        valid_actions = {"continue", "complete", "request_file", "request_link"}
        if action not in valid_actions:
            action = "continue"

        # DETERMINISTIC COMPLETION GATE. The model does not get the final say on
        # closing the application: if it tries to complete while a REQUIRED
        # document is still outstanding, override it into a concrete request for
        # the first pending item. This is the one hard guarantee that a candidate
        # can never be "submitted" with required evidence missing.
        if action == "complete" and pending:
            nxt = pending[0]
            action = "request_file" if nxt.get("type") == "file" else "request_link"
            req_id = nxt.get("id")
            req_label = nxt.get("label")
            kind = "upload" if nxt.get("type") == "file" else "link"
            message = (
                f"Before I wrap up, there's one thing still outstanding: could you "
                f"share your {nxt.get('label', 'required document')}? A {kind} is fine."
            )
            collected_fields = []

        # Stream the message character by character for a typewriter effect
        for i, char in enumerate(message):
            yield {"type": "token", "text": char}
            if i % 5 == 0:  # Small delay for realism
                await asyncio.sleep(0.01)

        yield {
            "type": "done",
            "message": _sanitise_ai_message(message),
            "action": action,
            "requirement_id": req_id,
            "requirement_label": req_label,
            "collected_fields": collected_fields,
        }
        
    except Exception as err:
        log.error("stream_fail err_type=%s err=%s", type(err).__name__, err, exc_info=True)
        yield {
            "type": "error",
            "message": "Give me a second, send that one more time?",
            "detail": f"{type(err).__name__}: {err}",
            "stage": "stream_conversation_response",
        }
