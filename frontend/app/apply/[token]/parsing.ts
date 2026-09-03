/* Reading structure out of the conversation.

The agent tags what it collects, but a transcript is still prose. Everything
here turns that prose into the field/value pairs the review screen renders.
No React, no network, no state: pure functions over messages, which is why
they sit apart from the page. */

import type { FieldType, StructuredField, OpenAnswer, ConversationMessage } from "./types";

/**
 * Match an AI question against a known structured-field pattern.
 * Returns the field metadata if matched, null otherwise.
 */
export const STRUCTURED_PATTERNS: Array<{
  label: string;
  type: FieldType;
  required: boolean;
  re: RegExp;
}> = [
  { label: "Email",                   type: "email",    required: true,  re: /\b(email\s*address|your\s+email|email)\b/i },
  { label: "Phone number",            type: "phone",    required: true,  re: /\b(phone(\s*number)?|mobile(\s*number)?|contact\s+number)\b/i },
  { label: "Date of birth",           type: "date",     required: true,  re: /\b(date\s*of\s*birth|d\.?o\.?b|when\s+were\s+you\s+born|birth\s*date)\b/i },
  { label: "Nationality",             type: "text",     required: true,  re: /\b(your\s+nationality|what\s+is\s+your\s+nationality|citizenship)\b/i },
  { label: "Country of residence",    type: "text",     required: true,  re: /\b(country\s+of\s+residence|country\s+(do\s+you\s+(live|reside)|you\s+(live|reside)|currently\s+live)|which\s+country|what\s+country)\b/i },
  { label: "Current city / location", type: "text",     required: true,  re: /\b(current\s+(city|location)|city\s+(of\s+residence|or\s+location|you\s+(live|reside))|where\s+(are\s+you\s+(based|located)|do\s+you\s+(live|reside)))\b/i },
  { label: "Full postal address",     type: "text",     required: false, re: /\b(full\s+postal\s+address|postal\s+address|home\s+address|street\s+address|residential\s+address|full\s+address)\b/i },
  { label: "Current job title",       type: "text",     required: true,  re: /\b(current\s+job\s+title|current\s+(role|position)|job\s+title|what(\s+is|'s)\s+your\s+(current\s+)?(role|position|title|job\s+title))\b/i },
  { label: "Current employer",        type: "text",     required: true,  re: /\b(current\s+(employer|company)|where\s+do\s+you\s+(currently\s+)?work|who\s+do\s+you\s+(currently\s+)?work\s+for|most\s+recent\s+employer|current\s+company)\b/i },
  { label: "Years of experience",     type: "number",   required: true,  re: /\b(years?\s+of\s+(professional\s+)?experience|how\s+many\s+years|total\s+(years?\s+of\s+)?experience|experience\s+years)\b/i },
  { label: "Notice period",           type: "text",     required: false, re: /\b(notice\s+period|earliest\s+(start|available)|when\s+(can|could)\s+you\s+start|earliest\s+start\s+date|start\s+date)\b/i },
  { label: "Expected salary",         type: "currency", required: false, re: /\b(expected\s+salary|salary\s+(expectation|range|expectations)|how\s+much\s+(do\s+you\s+expect|are\s+you\s+looking))\b/i },
  { label: "Willing to relocate",     type: "yes_no",   required: false, re: /\b(willing\s+to\s+relocate|open\s+to\s+relocat|relocation|willing\s+to\s+move)\b/i },
  { label: "Work authorisation",      type: "yes_no",   required: false, re: /\b(work\s+authoris(ation)?|work\s+authoriz(ation)?|right\s+to\s+work|authoris(ed|ation)\s+to\s+work|authoriz(ed|ation)\s+to\s+work|work\s+permit|work\s+visa)\b/i },
  { label: "Highest education",       type: "text",     required: false, re: /\b(highest\s+(education|qualification|degree|level\s+of\s+education)|education(\s+level)?\s+(attained|completed)|education\s+level)\b/i },
  { label: "Full name",               type: "text",     required: true,  re: /\b(full\s+name|your\s+full\s+name|confirm\s+your\s+(full\s+)?name)\b/i },
];

export const PERSONAL_RE = /\b(your name|full name|email address|phone number|phone|location|where are you|currently based|currently employed|employment status|working at|confirm your|date of birth|nationality|country|address|notice|salary|relocate|work authoris|highest education|years of (professional )?experience|current (job title|employer|role|position))\b/i;

/**
 * The contract between the AI's `collected_fields` payload and the review
 * screen. Backend whitelists exactly these ids, anything else is dropped
 * before it reaches the browser, so the keys here are guaranteed clean.
 */
export const FIELD_ID_TABLE: Array<{
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
}> = [
  { id: "full_name",            label: "Full name",                 type: "text",     required: true  },
  { id: "email",                label: "Email",                     type: "email",    required: true  },
  { id: "phone_number",         label: "Phone number",              type: "phone",    required: true  },
  { id: "current_city",         label: "Current city / location",   type: "text",     required: true  },
  { id: "country_of_residence", label: "Country of residence",      type: "text",     required: true  },
  { id: "postal_address",       label: "Full postal address",       type: "text",     required: false },
  { id: "date_of_birth",        label: "Date of birth",             type: "date",     required: true  },
  { id: "nationality",          label: "Nationality",               type: "text",     required: true  },
  { id: "current_job_title",    label: "Current job title",         type: "text",     required: true  },
  { id: "current_employer",     label: "Current employer",          type: "text",     required: true  },
  { id: "years_of_experience",  label: "Years of experience",       type: "number",   required: true  },
  { id: "employment_history",   label: "Employment history",        type: "text",     required: false },
  { id: "education_history",    label: "Education history",         type: "text",     required: false },
  { id: "notice_period",        label: "Notice period",             type: "text",     required: false },
  { id: "expected_salary",      label: "Expected salary",           type: "currency", required: false },
  { id: "willing_to_relocate",  label: "Willing to relocate",       type: "yes_no",   required: false },
  { id: "work_authorisation",   label: "Work authorisation",        type: "yes_no",   required: false },
  { id: "highest_education",    label: "Highest education",         type: "text",     required: false },
  { id: "language_proficiency", label: "Language proficiency",      type: "text",     required: false },
];

/**
 * Build the review-screen field list from the AI-tagged `collectedFields`
 * map. This is the rigid path: the AI told us field X = value Y, we just
 * render it. No regex, no question-pairing.
 *
 * Pre-seeded name/email from auth always win if collectedFields hasn't
 * tagged them yet. Order follows FIELD_ID_TABLE so the review screen has
 * a stable layout regardless of collection order.
 */
export function buildStructuredFieldsFromTags(
  collectedFields: Record<string, string>,
  candidateName: string,
  candidateEmail: string,
): StructuredField[] {
  const out: StructuredField[] = [];
  const trimmedName  = candidateName.trim();
  const trimmedEmail = candidateEmail.trim();

  for (const meta of FIELD_ID_TABLE) {
    const tagged = collectedFields[meta.id];
    let value = tagged?.trim() ?? "";
    // Auth presets fill name/email if the AI hasn't tagged them yet.
    if (!value && meta.id === "full_name"  && trimmedName)  value = trimmedName;
    if (!value && meta.id === "email"      && trimmedEmail) value = trimmedEmail;
    if (!value) continue;
    out.push({
      id:          `tagged:${meta.id}`,
      label:       meta.label,
      type:        meta.type,
      value,
      required:    meta.required,
      sourceIndex: null,
    });
  }
  return out;
}

/**
 * Validate a structured field value against its type. Returns an error
 * string for the user, or empty string if valid.
 */
export function validateField(value: string, type: FieldType, required: boolean): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return required ? "This field is required." : "";
  }
  switch (type) {
    case "email": {
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed);
      return ok ? "" : "Please enter a valid email address.";
    }
    case "phone": {
      // Strip everything that isn't a digit or leading +; require at least 7 digits.
      const digits = trimmed.replace(/[^\d]/g, "");
      if (digits.length < 7) {
        return "Phone number is too short, please include the full number.";
      }
      // Must contain country-code-style prefix OR look international.
      const startsOk = /^\+?\d/.test(trimmed);
      return startsOk ? "" : "Please enter a valid phone number.";
    }
    case "date": {
      // Accept ISO, DD/MM/YYYY, or natural like "12 March 1999".
      const t = new Date(trimmed);
      if (Number.isNaN(t.getTime())) {
        // try DD/MM/YYYY -> YYYY-MM-DD
        const m = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
        if (m) {
          let [, d, mo, y] = m;
          if (y.length === 2) y = `19${y}`;
          const t2 = new Date(`${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`);
          if (!Number.isNaN(t2.getTime())) {
            if (t2.getTime() > Date.now()) return "Date of birth cannot be in the future.";
            return "";
          }
        }
        return "Please enter a valid date.";
      }
      if (t.getTime() > Date.now()) return "Date of birth cannot be in the future.";
      return "";
    }
    case "number": {
      const n = parseFloat(trimmed.replace(/[^\d.\-]/g, ""));
      return Number.isFinite(n) ? "" : "Please enter a number.";
    }
    case "currency":
    case "yes_no":
    case "text":
    default:
      return trimmed.length === 0 && required ? "This field is required." : "";
  }
}

/**
 * Pull the actual question sentence out of an AI message. AI messages
 * frequently look like "Gambian nationality. What is your current job
 * title?", confirming the previous field, then asking the next. We only
 * want to match field patterns against the trailing question.
 */
export function extractQuestionSentence(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return "";
  // Split on sentence boundaries (., !, ?) followed by whitespace.
  const sentences = trimmed.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  if (sentences.length === 0) return trimmed;
  // Prefer the last sentence ending with '?'.
  for (let i = sentences.length - 1; i >= 0; i--) {
    if (sentences[i].includes("?")) return sentences[i];
  }
  // Otherwise, the last non-trivial sentence.
  return sentences[sentences.length - 1];
}

/**
 * Decide whether an AI message is actually asking a question. Confirmations
 * ("Got it.", "Noted."), single-word echoes ("Abdoulie Balisa.") and pure
 * acknowledgments must not be paired with the candidate's next answer.
 */
export function isQuestionMessage(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  // Single token / echo (e.g. "Abdoulie Balisa." or "Ghana.").
  if (/^[\w\s,'-]{1,40}\.$/.test(trimmed) && !/\?/.test(trimmed)) return false;
  // Pure acknowledgment openers with no actual question downstream.
  if (/^(got it|noted|okay|ok|i see|understood|i('ve)? noted|thanks|moving on|alright)[.!]?$/i.test(trimmed)) {
    return false;
  }
  // Has a question mark, OR contains an interrogative.
  if (trimmed.includes("?")) return true;
  return /\b(what|where|when|why|how|which|could|would|can|please share|tell me|confirm)\b/i.test(trimmed);
}

/**
 * Scan AI messages for confirmation phrases that supply a corrected value
 * for a structured field. Returns a map keyed by the canonical field label.
 *
 *   "Ghana is your country of residence."          -> Country of residence: Ghana
 *   "I've noted that your nationality is Gambian." -> Nationality: Gambian
 *   "So your phone number is +220 314 8206."       -> Phone number: +220 314 8206
 */
export function extractConfirmedFields(messages: ConversationMessage[]): Record<string, string> {
  const FIELD_ALIASES: Record<string, string> = {
    "country":                   "Country of residence",
    "country of residence":      "Country of residence",
    "nationality":               "Nationality",
    "citizenship":               "Nationality",
    "city":                      "Current city / location",
    "location":                  "Current city / location",
    "current city":              "Current city / location",
    "current location":          "Current city / location",
    "current city or location":  "Current city / location",
    "current city / location":   "Current city / location",
    "email":                     "Email",
    "email address":             "Email",
    "phone":                     "Phone number",
    "phone number":              "Phone number",
    "date of birth":             "Date of birth",
    "address":                   "Full postal address",
    "postal address":            "Full postal address",
    "full postal address":       "Full postal address",
    "job title":                 "Current job title",
    "current job title":         "Current job title",
    "employer":                  "Current employer",
    "current employer":          "Current employer",
    "company":                   "Current employer",
    "years of experience":       "Years of experience",
    "experience":                "Years of experience",
    "notice period":             "Notice period",
    "expected salary":           "Expected salary",
    "salary":                    "Expected salary",
    "salary range":              "Expected salary",
    "highest education":         "Highest education",
    "education level":           "Highest education",
    "education":                 "Highest education",
    "work authorisation":        "Work authorisation",
    "work authorization":        "Work authorisation",
  };

  const confirmed: Record<string, string> = {};
  // Patterns that capture (value, field) or (field, value).
  const patterns: Array<{ re: RegExp; valueIdx: number; fieldIdx: number }> = [
    // "Ghana is your country of residence."
    { re: /\b([A-Z][\w'.+\- /@]{0,80}?)\s+is\s+your\s+([a-z][\w \-/]{2,40}?)[.!]/g, valueIdx: 1, fieldIdx: 2 },
    // "Your country of residence is Ghana."
    { re: /\byour\s+([a-z][\w \-/]{2,40}?)\s+is\s+([A-Z0-9+@][\w'.+\- /@]{0,80}?)[.!]/gi, valueIdx: 2, fieldIdx: 1 },
    // "I've noted your nationality as Gambian." / "I've noted that your nationality is Gambian."
    { re: /i['']?ve\s+noted\s+(?:that\s+)?your\s+([a-z][\w \-/]{2,40}?)\s+(?:as|is)\s+([A-Z0-9+@][\w'.+\- /@]{0,80}?)[.!]/gi, valueIdx: 2, fieldIdx: 1 },
    // "So/that means your country is Ghana."
    { re: /(?:so|that\s+means)\s+your\s+([a-z][\w \-/]{2,40}?)\s+is\s+([A-Z0-9+@][\w'.+\- /@]{0,80}?)[.!]/gi, valueIdx: 2, fieldIdx: 1 },
  ];

  for (const m of messages) {
    if (m.role !== "ai" || !m.content) continue;
    for (const { re, valueIdx, fieldIdx } of patterns) {
      re.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = re.exec(m.content)) !== null) {
        const rawField = match[fieldIdx]?.trim().toLowerCase().replace(/\s+/g, " ");
        const rawValue = match[valueIdx]?.trim();
        if (!rawField || !rawValue) continue;
        const canonical = FIELD_ALIASES[rawField];
        if (!canonical) continue;
        // Skip degenerate values like single letters or pure punctuation.
        if (rawValue.length < 2) continue;
        confirmed[canonical] = rawValue;
      }
    }
  }
  return confirmed;
}

/**
 * Walk the conversation and extract:
 *   - structured fields (one row per known label, latest answer wins)
 *   - open-ended Q/A (everything else with a substantive answer)
 *   - candidate messages that gave each structured field's value (so edits
 *     can update the underlying transcript)
 */
export function extractReviewSections(
  messages: ConversationMessage[],
  candidateName: string,
  candidateEmail: string,
): { fields: StructuredField[]; openAnswers: OpenAnswer[] } {
  const fields: StructuredField[] = [];

  // Pre-seed name + email from the auth flow if available.
  if (candidateName.trim()) {
    fields.push({
      id:          "preset:full_name",
      label:       "Full name",
      type:        "text",
      value:       candidateName.trim(),
      required:    true,
      sourceIndex: null,
    });
  }
  if (candidateEmail.trim()) {
    fields.push({
      id:          "preset:email",
      label:       "Email",
      type:        "email",
      value:       candidateEmail.trim(),
      required:    true,
      sourceIndex: null,
    });
  }

  // Pull AI-confirmed corrections up-front so we can override raw candidate
  // input when the AI clearly cleaned it up later in the dialogue.
  const confirmedFields = extractConfirmedFields(messages);

  const sourceMessageIds = new Set<string>();

  for (let i = 0; i < messages.length; i++) {
    const ai = messages[i];
    if (ai.role !== "ai" || !ai.content) continue;
    if (ai.content.length > 400) continue; // avoid catching long open questions
    if (!isQuestionMessage(ai.content)) continue;

    const next = messages[i + 1];
    if (!next || next.role !== "candidate" || !next.content?.trim()) continue;

    // CRITICAL: only test field patterns against the *question sentence*, // the trailing question, not the leading confirmation. Otherwise an AI
    // message like "Gambian nationality. What is your current job title?"
    // mis-matches "nationality" and pairs the next answer to the wrong slot.
    const questionPart = extractQuestionSentence(ai.content);

    for (const pat of STRUCTURED_PATTERNS) {
      if (!pat.re.test(questionPart)) continue;
      const existingIdx = fields.findIndex((f) => f.label === pat.label);
      // Prefer the AI-confirmed corrected value when one exists for this
      // field; otherwise fall back to the candidate's raw answer.
      const correctedValue = confirmedFields[pat.label];
      const finalValue = (correctedValue ?? next.content).trim();
      const entry: StructuredField = {
        id:          next.id,
        label:       pat.label,
        type:        pat.type,
        value:       finalValue,
        required:    pat.required,
        sourceIndex: i + 1,
      };
      if (existingIdx === -1) {
        fields.push(entry);
      } else {
        fields[existingIdx] = entry;
      }
      sourceMessageIds.add(next.id);
      break; // one pattern per AI question
    }
  }

  // Final sweep: if the AI confirmed a value for a field we never managed to
  // pair (because the question sentence was atypical), still surface it.
  for (const [label, value] of Object.entries(confirmedFields)) {
    if (fields.some((f) => f.label === label)) continue;
    const meta = STRUCTURED_PATTERNS.find((p) => p.label === label);
    if (!meta) continue;
    fields.push({
      id:          `confirmed:${label}`,
      label,
      type:        meta.type,
      value,
      required:    meta.required,
      sourceIndex: null,
    });
  }

  // Open-ended answers: every substantive candidate message NOT used to
  // populate a structured field.
  const openAnswers: OpenAnswer[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role !== "candidate") continue;
    if (sourceMessageIds.has(m.id)) continue;
    if (m.content.trim().split(/\s+/).length < 4) continue;
    const prevAi = messages.slice(0, i).filter((x) => x.role === "ai").at(-1);
    if (prevAi && PERSONAL_RE.test(prevAi.content ?? "")) continue;
    openAnswers.push({
      id:       m.id,
      question: prevAi?.content ?? "Question",
      answer:   m.content,
    });
  }

  return { fields, openAnswers };
}
