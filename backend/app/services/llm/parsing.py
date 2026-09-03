"""
Turning model output into things the rest of the app can trust.

The model returns prose with JSON somewhere inside it, and a collected_fields
array whose ids are a contract. Anything not in COLLECTED_FIELD_IDS is dropped
before the response leaves the backend.
"""

import re


# ── Structured field tagging ─────────────────────────────────────────────────
# The conversation driver returns a `collected_fields` array on every turn so
# the frontend can build the review screen from explicit field/value pairs
# instead of regex-parsing AI prose. The IDs below are the contract: anything
# the AI emits that isn't in this set is dropped before the response leaves
# the backend.

COLLECTED_FIELD_IDS: set[str] = {
    "full_name",
    "email",
    "phone_number",
    "current_city",
    "country_of_residence",
    "postal_address",
    "date_of_birth",
    "nationality",
    "current_job_title",
    "current_employer",
    "years_of_experience",
    "employment_history",
    "education_history",
    "notice_period",
    "expected_salary",
    "willing_to_relocate",
    "work_authorisation",
    "highest_education",
    "language_proficiency",
}




def _validate_collected_fields(raw: object) -> list[dict]:
    """
    Coerce whatever the model returned into a clean list of
    ``[{"id": <whitelisted>, "value": <non-empty trimmed string>}, ...]``.
    Anything malformed is silently dropped so a sloppy turn never poisons
    the review screen.
    """
    if not isinstance(raw, list):
        return []
    out: list[dict] = []
    seen: set[str] = set()
    for item in raw:
        if not isinstance(item, dict):
            continue
        fid = item.get("id")
        val = item.get("value")
        if not isinstance(fid, str) or not isinstance(val, (str, int, float, bool)):
            continue
        fid = fid.strip().lower()
        if fid not in COLLECTED_FIELD_IDS:
            continue
        sval = str(val).strip()
        if not sval:
            continue
        if fid in seen:
            # Latest value wins, replace prior entry.
            for existing in out:
                if existing["id"] == fid:
                    existing["value"] = sval
                    break
            continue
        seen.add(fid)
        out.append({"id": fid, "value": sval})
    return out




# ── Shared helpers ──────────────────────────────────────────────────────────

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




def _is_meaningfully_empty(d: dict) -> bool:
    """A config dict is 'empty' if it has no keys, or every value is falsy."""
    if not d:
        return True
    return not any(v for v in d.values() if v not in (0, False, None, ""))




# ── Output sanitiser ────────────────────────────────────────────────────────

# Em-dash, en-dash, and double-hyphen substitutes. The model leans on these
# despite explicit prompt instructions to avoid them. Strip them deterministically
# from every conversational reply before the candidate sees it.
_DASH_PATTERN = re.compile(r"\s*(?:, |, |--)\s*")



def _sanitise_ai_message(text: str) -> str:
    """Replace em/en dashes and `--` with comma + space, tidy whitespace, trim."""
    if not text:
        return ""
    cleaned = _DASH_PATTERN.sub(", ", str(text))
    # Collapse only horizontal whitespace runs, never newlines or indentation.
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    cleaned = re.sub(r"\s+,", ",", cleaned)
    return cleaned.strip()
