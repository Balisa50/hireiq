"use client";

/**
 * HireIQ Application — Conversational experience
 *
 * Screens: loading → auth → conversation → review → complete | error
 *
 * Fixes applied:
 *  - File input accepts all types (accept="*\/*") + multiple selection + processes all files
 *  - All text forced LTR (dir="ltr") on containers, textarea, and message bubbles
 *  - Scroll lock: RAF-based scrollTop = scrollHeight — no jerk during streaming
 *  - Textarea: max-height 160px, overflow-y-auto, resets to single line after send
 *  - Review screen: explicit gate before any submission. Backend sets pending_review;
 *    scoring only happens after candidate clicks confirm here.
 *  - "Go back" returns to read-only conversation view (input disabled)
 *  - Optional documents: agent accepts graceful decline, never forces
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { Paperclip, Link2, Send, AlertCircle, CheckCircle2, ChevronRight } from "lucide-react";
import { interviewAPI, pingBackendHealth, wakeBackend, waitForBackendWarm } from "@/lib/api";
import type { JobPublicInfo } from "@/lib/types";

// ── Types ──────────────────────────────────────────────────────────────────────

type Screen = "loading" | "welcome" | "auth" | "conversation" | "review" | "complete" | "error";

interface ConversationMessage {
  id: string;
  role: "ai" | "candidate";
  content: string;
  timestamp: string;
  isTyping?: boolean;
  /**
   * If set, the AI bubble types its content out character-by-character.
   * Cleared (or absent) on bubbles that have already finished animating
   * or were restored from localStorage.
   */
  animate?: boolean;
  /** Optional millisecond delay before the typewriter starts. */
  animateDelayMs?: number;
  action?: "continue" | "request_file" | "request_link" | "complete";
  requirement_id?: string | null;
  requirement_label?: string | null;
  cardStatus?: "idle" | "uploading" | "complete" | "error";
  cardProgress?: number;
  cardFileName?: string;
  cardFileSize?: number;
  cardUrl?: string;
  cardError?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function nanoid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Review helpers ─────────────────────────────────────────────────────────────

type FieldType = "text" | "email" | "phone" | "date" | "yes_no" | "number" | "currency";

interface StructuredField {
  /** id used to key edits + locate the source candidate message */
  id:          string;
  /** Visible label on the review screen */
  label:       string;
  /** Detection type — drives validation + rendering */
  type:        FieldType;
  /** Extracted value the candidate gave */
  value:       string;
  /** Whether this field must validate before submit */
  required:    boolean;
  /** Index of the candidate message that produced this value (for editing) */
  sourceIndex: number | null;
}

interface OpenAnswer {
  id:       string;
  question: string;
  answer:   string;
}

/**
 * Match an AI question against a known structured-field pattern.
 * Returns the field metadata if matched, null otherwise.
 */
const STRUCTURED_PATTERNS: Array<{
  label: string;
  type: FieldType;
  required: boolean;
  re: RegExp;
}> = [
  { label: "Email",                   type: "email",    required: true,  re: /\b(email\s*address|email)\b/i },
  { label: "Phone number",            type: "phone",    required: true,  re: /\bphone(\s*number)?\b/i },
  { label: "Date of birth",           type: "date",     required: true,  re: /\b(date\s*of\s*birth|d\.?o\.?b)\b/i },
  { label: "Nationality",             type: "text",     required: true,  re: /\bnationality|citizenship\b/i },
  { label: "Country of residence",    type: "text",     required: true,  re: /\bcountry\s+(of|you\s+(live|reside)|currently\s+live)|country\s+of\s+residence\b/i },
  { label: "Current city / location", type: "text",     required: true,  re: /\bcurrent\s+(city|location)|where\s+(are\s+you\s+based|do\s+you\s+live|are\s+you\s+located)|current\s+location\b/i },
  { label: "Full postal address",     type: "text",     required: false, re: /\b(full\s+postal\s+address|full\s+address|postal\s+address|home\s+address|street\s+address)\b/i },
  { label: "Current job title",       type: "text",     required: true,  re: /\b(current\s+job\s+title|current\s+(role|position)|job\s+title|what\s+is\s+your\s+(current\s+)?(role|position|title))\b/i },
  { label: "Current employer",        type: "text",     required: true,  re: /\b(current\s+(employer|company)|where\s+do\s+you\s+(currently\s+)?work|who\s+do\s+you\s+(currently\s+)?work\s+for|most\s+recent\s+employer)\b/i },
  { label: "Years of experience",     type: "number",   required: true,  re: /\b(years?\s+of\s+(professional\s+)?experience|how\s+many\s+years|total\s+(years?\s+of\s+)?experience)\b/i },
  { label: "Notice period",           type: "text",     required: false, re: /\b(notice\s+period|earliest\s+(start|available)|when\s+(can|could)\s+you\s+start|earliest\s+start\s+date)\b/i },
  { label: "Expected salary",         type: "currency", required: false, re: /\b(expected\s+salary|salary\s+expectation|salary\s+range|how\s+much\s+(do\s+you\s+expect|are\s+you\s+looking))\b/i },
  { label: "Willing to relocate",     type: "yes_no",   required: false, re: /\b(willing\s+to\s+relocate|open\s+to\s+relocat|relocation)\b/i },
  { label: "Work authorisation",      type: "yes_no",   required: false, re: /\b(work\s+authorisation|work\s+authorization|right\s+to\s+work|authorised\s+to\s+work|authorized\s+to\s+work|work\s+permit|visa)\b/i },
  { label: "Highest education",       type: "text",     required: false, re: /\b(highest\s+(education|qualification|degree)|education(\s+level)?\s+(attained|completed)|highest\s+level\s+of\s+education)\b/i },
  { label: "Full name",               type: "text",     required: true,  re: /\b(full\s+name|your\s+full\s+name|confirm\s+your\s+(full\s+)?name)\b/i },
];

const PERSONAL_RE = /\b(your name|full name|email address|phone number|phone|location|where are you|currently based|currently employed|employment status|working at|confirm your|date of birth|nationality|country|address|notice|salary|relocate|work authoris|highest education|years of (professional )?experience|current (job title|employer|role|position))\b/i;

/**
 * Validate a structured field value against its type. Returns an error
 * string for the user, or empty string if valid.
 */
function validateField(value: string, type: FieldType, required: boolean): string {
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
        return "Phone number is too short — please include the full number.";
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
 * Walk the conversation and extract:
 *   - structured fields (one row per known label, latest answer wins)
 *   - open-ended Q/A (everything else with a substantive answer)
 *   - candidate messages that gave each structured field's value (so edits
 *     can update the underlying transcript)
 */
function extractReviewSections(
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

  const sourceMessageIds = new Set<string>();

  for (let i = 0; i < messages.length; i++) {
    const ai = messages[i];
    if (ai.role !== "ai" || !ai.content) continue;
    if (ai.content.length > 250) continue; // avoid catching long open questions

    const next = messages[i + 1];
    if (!next || next.role !== "candidate" || !next.content?.trim()) continue;

    for (const pat of STRUCTURED_PATTERNS) {
      if (!pat.re.test(ai.content)) continue;
      // Latest answer wins — replace any existing entry for this label.
      const existingIdx = fields.findIndex((f) => f.label === pat.label);
      const entry: StructuredField = {
        id:          next.id,
        label:       pat.label,
        type:        pat.type,
        value:       next.content.trim(),
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

// ── Mark (logo) ────────────────────────────────────────────────────────────────

function Mark({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <polyline points="9 11 12 14 15 8" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function Spinner({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ── Welcome Screen ─────────────────────────────────────────────────────────────

function WelcomeScreen({
  jobInfo,
  onStart,
  isStarting,
}: {
  jobInfo: JobPublicInfo;
  onStart: () => void;
  isStarting?: boolean;
}) {
  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-4 py-12" dir="ltr">
      <div className="max-w-[520px] w-full space-y-8">

        {/* Brand mark */}
        <div className="flex justify-center">
          <Mark className="w-7 h-7 text-ink" />
        </div>

        {/* Job context */}
        <div className="text-center space-y-2">
          <p className="text-[12px] font-semibold text-muted uppercase tracking-widest">
            {jobInfo.company_name}
          </p>
          <h1
            className="text-[30px] font-bold text-ink leading-tight"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            {jobInfo.title}
          </h1>
          {(jobInfo.department || jobInfo.location || jobInfo.employment_type) && (
            <p className="text-[13px] text-muted">
              {[jobInfo.department, jobInfo.location, jobInfo.employment_type].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>

        {/* Job description */}
        {jobInfo.job_description && (
          <div className="bg-white border border-border rounded-[4px] px-5 py-4">
            <p className="text-[13px] text-sub leading-relaxed whitespace-pre-line">
              {jobInfo.job_description}
            </p>
          </div>
        )}

        {/* What to expect */}
        <div className="bg-white border border-border rounded-[4px] divide-y divide-border">
          {[
            { icon: "01", text: "You'll have a short conversation with our AI assistant — it asks questions, you type your answers." },
            { icon: "02", text: "Be specific and honest. There are no trick questions — just tell your story." },
            { icon: "03", text: "Takes around 10–15 minutes. Your progress is saved if you need to pause." },
          ].map(({ icon, text }) => (
            <div key={icon} className="flex items-start gap-4 px-5 py-4">
              <span className="text-[11px] font-semibold text-muted tabular-nums shrink-0 mt-0.5">{icon}</span>
              <p className="text-[13px] text-sub leading-relaxed">{text}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={onStart}
          disabled={isStarting}
          className="w-full bg-[#1A1714] text-white rounded-[4px] px-4 py-3.5 text-[14px] font-semibold hover:bg-[#2d2926] transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {isStarting ? "Starting…" : <><span>Start Application</span> <ChevronRight className="w-4 h-4" /></>}
        </button>

        <p className="text-center text-[11px] text-muted">Secured by HireIQ</p>
      </div>
    </div>
  );
}

// ── Auth Screen ────────────────────────────────────────────────────────────────

interface AuthScreenProps {
  jobInfo: JobPublicInfo;
  onAuth: (name: string, email: string) => Promise<void>;
  onGoogleAuth: () => Promise<void>;
  isLoading: boolean;
  googleLoading: boolean;
  globalError: string;
}

function AuthScreen({ jobInfo, onAuth, onGoogleAuth, isLoading, googleLoading, globalError }: AuthScreenProps) {
  const [name, setName]       = useState("");
  const [email, setEmail]     = useState("");
  const [consent, setConsent] = useState(false);
  const [errors, setErrors]   = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!name.trim() || name.trim().length < 2) e.name = "Please enter your full name.";
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Please enter a valid email address.";
    if (!consent) e.consent = "Please confirm your consent to proceed.";
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    await onAuth(name.trim(), email.trim().toLowerCase());
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-4 py-12" dir="ltr">
      <div className="max-w-[400px] w-full space-y-6">
        <div className="text-center space-y-3">
          <Mark className="w-7 h-7 text-ink mx-auto" />
          <p className="text-[13px] text-muted">
            Applying to{" "}
            <span className="font-semibold text-ink">{jobInfo.company_name}</span>
            {" · "}
            <span className="text-sub">{jobInfo.title}</span>
          </p>
          <h1 className="text-[26px] font-bold text-ink leading-tight"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
            Create an account to apply
          </h1>
          <p className="text-[13px] text-sub leading-relaxed">
            Your account lets you save progress and return to your application if needed.
          </p>
        </div>

        <div className="bg-white border border-border rounded-[4px] p-6 space-y-4">
          {globalError && (
            <div className="flex items-start gap-2 rounded-[4px] bg-red-50 border border-danger/20 px-3 py-2.5 text-[13px] text-danger">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {globalError}
            </div>
          )}

          <button
            onClick={onGoogleAuth}
            disabled={googleLoading || isLoading}
            className="w-full flex items-center justify-center gap-3 bg-[#1A1714] text-white rounded-[4px] px-4 py-3 text-[14px] font-medium hover:bg-[#2d2926] transition-colors disabled:opacity-50"
          >
            {googleLoading ? <Spinner /> : <GoogleIcon />}
            Continue with Google
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[12px] text-muted">or enter your details</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-[12px] font-medium text-ink mb-1">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                autoComplete="name"
                dir="ltr"
                className={`w-full bg-[var(--bg)] border rounded-[4px] px-3 py-2.5 text-[14px] text-ink outline-none transition-colors focus:border-ink placeholder:text-muted ${errors.name ? "border-danger" : "border-border"}`}
              />
              {errors.name && <p className="text-[12px] text-danger mt-1">{errors.name}</p>}
            </div>
            <div>
              <label className="block text-[12px] font-medium text-ink mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                autoComplete="email"
                dir="ltr"
                onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                className={`w-full bg-[var(--bg)] border rounded-[4px] px-3 py-2.5 text-[14px] text-ink outline-none transition-colors focus:border-ink placeholder:text-muted ${errors.email ? "border-danger" : "border-border"}`}
              />
              {errors.email && <p className="text-[12px] text-danger mt-1">{errors.email}</p>}
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-ink cursor-pointer shrink-0"
              />
              <span className="text-[12px] text-sub leading-relaxed">
                I confirm my answers are my own and consent to them being reviewed by{" "}
                <strong>{jobInfo.company_name}</strong>&apos;s hiring team.
              </span>
            </label>
            {errors.consent && <p className="text-[12px] text-danger">{errors.consent}</p>}
          </div>

          <button
            onClick={handleSubmit}
            disabled={isLoading || googleLoading}
            className="w-full bg-[#1A1714] text-white rounded-[4px] px-4 py-3 text-[14px] font-semibold hover:bg-[#2d2926] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? <><Spinner /> Setting up your application…</> : "Continue →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── AI Message Bubble ──────────────────────────────────────────────────────────

function AIMessageBubble({ message }: { message: ConversationMessage }) {
  const isTypingDots = !!message.isTyping;
  return (
    <div className="flex items-start gap-3" dir="ltr">
      <div className="w-6 h-6 rounded-full bg-white border border-border flex items-center justify-center shrink-0 mt-1">
        {isTypingDots ? (
          <span className="w-1.5 h-4 bg-muted rounded-full animate-pulse inline-block" />
        ) : (
          <Mark className="w-3 h-3 text-muted" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        {isTypingDots ? (
          <span className="text-[16px] text-muted animate-pulse"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>_</span>
        ) : (
          <p className="text-[16px] text-ink leading-[1.75] whitespace-pre-wrap"
            style={{ fontFamily: "'Playfair Display', Georgia, serif", textAlign: "left", direction: "ltr" }}>
            {message.content}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Candidate Message ──────────────────────────────────────────────────────────

function CandidateMessageBubble({ content, showTimestamp, timestamp }: {
  content: string; showTimestamp?: boolean; timestamp: string;
}) {
  const time = new Date(timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="flex flex-col items-end gap-1" dir="ltr">
      {showTimestamp && (
        <p className="text-[11px]" style={{ color: "#9C9590" }}>{time}</p>
      )}
      <p
        className="text-[15px] text-ink border-r-2 border-[#E8E4DF] pr-3.5 max-w-[85%] leading-relaxed w-fit"
        style={{ textAlign: "left", direction: "ltr" }}
      >
        {content}
      </p>
    </div>
  );
}

// ── Top Bar ────────────────────────────────────────────────────────────────────

function TopBar({ company, title, progress }: { company: string; title: string; progress: number }) {
  return (
    <div className="border-b border-border bg-[var(--bg)] shrink-0">
      <div className="max-w-[680px] mx-auto px-4 h-12 flex items-center justify-between gap-4">
        <span className="text-[12px] text-muted truncate">{company}</span>
        <span className="text-[12px] text-muted truncate hidden sm:block">{title}</span>
        <div className="w-24 h-1 bg-border rounded-full overflow-hidden shrink-0">
          <div className="h-full bg-ink rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ApplicationPage() {
  const { token } = useParams<{ token: string }>();
  const [screen, setScreen]     = useState<Screen>("loading");
  const [jobInfo, setJobInfo]   = useState<JobPublicInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Loading screen subtext (shown while retrying on cold-start)
  const [loadingSubtext, setLoadingSubtext]   = useState("");

  // Auth state
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [candidateName, setCandidateName]         = useState("");
  const [candidateEmail, setCandidateEmail]       = useState("");

  // Application session
  const [applicationId, setApplicationId]       = useState("");
  const [messages, setMessages]                 = useState<ConversationMessage[]>([]);
  const [inputValue, setInputValue]             = useState("");
  const [isWaitingForAI, setIsWaitingForAI]     = useState(false);
  const [aiError, setAiError]                   = useState("");
  const [progressPct, setProgressPct]           = useState(0);
  // Once the AI fires "complete", lock the input
  const [applicationComplete, setApplicationComplete] = useState(false);

  // Bar-level upload / link state
  const [linkValue, setLinkValue]           = useState("");
  const [barError, setBarError]             = useState("");
  const [isUploading, setIsUploading]       = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadFileName, setUploadFileName] = useState("");
  const [uploadQueue, setUploadQueue]       = useState<File[]>([]);
  const pageFileRef = useRef<HTMLInputElement>(null);

  // Review screen state
  const [isSubmitting, setIsSubmitting]   = useState(false);
  const [submitError, setSubmitError]     = useState("");
  const [detailEdits, setDetailEdits] = useState<Record<string, string>>({});
  // Edits to candidate answers, keyed by message id (m.id). Sent on submit.
  const [answerEdits, setAnswerEdits] = useState<Record<string, string>>({});

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef            = useRef<HTMLTextAreaElement>(null);
  const lastShownTime       = useRef<number>(0);
  const isStartingRef       = useRef(false);
  const kickoffCalledRef    = useRef(false);
  // Set to true once the backend has responded to at least one CORS GET.
  // Used as a gate before POST requests to avoid cold-start CORS errors.
  const backendWarmRef      = useRef(false);
  // Session key for localStorage persistence (keyed by the URL link token)
  const SESSION_KEY = `hireiq_apply_${token}`;

  // ── Derive pending action from last AI message ─────────────────────────────
  const lastAiMsg = useMemo(
    () => messages.filter((m) => m.role === "ai" && !m.isTyping).at(-1),
    [messages],
  );
  const pendingAction: "continue" | "request_file" | "request_link" =
    lastAiMsg?.cardStatus !== "complete" &&
    (lastAiMsg?.action === "request_file" || lastAiMsg?.action === "request_link")
      ? lastAiMsg.action!
      : "continue";
  const hasCardPending = pendingAction !== "continue";

  // ── Scroll to bottom ──────────────────────────────────────────────────────
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const container = scrollContainerRef.current;
      if (!container) return;
      container.scrollTop = container.scrollHeight;
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // ── Keep Render warm — ping every 4 minutes so backend doesn't cold-start ──
  // Also fire a no-cors wake on mount: guaranteed to reach the dyno even if
  // it is sleeping and Cloudflare is not yet returning CORS headers.
  useEffect(() => {
    wakeBackend();         // no-cors — wakes dyno regardless of CORS state
    pingBackendHealth();   // regular CORS GET — updates backendWarmRef if it succeeds
    const id = setInterval(pingBackendHealth, 240_000);
    return () => clearInterval(id);
  }, []);

  // ── Load job info — retries on network failure (Render free-tier cold-start) ──
  useEffect(() => {
    let cancelled = false;

    const classifyError = (m: string) => {
      if (m.includes("closed") || m.includes("longer accepting") || m.includes("no longer active") || m.includes("longer active")) return "closed";
      if (m.includes("paused")) return "paused";
      if (m.includes("deadline") || m.includes("expired")) return "deadline";
      if (m.includes("limit") || m.includes("capacity")) return "limit";
      if (m.includes("not found") || m.includes("invalid")) return "not_found";
      return "unknown";
    };

    const isNetworkError = (e: unknown) => {
      const msg = (e instanceof Error ? e.message : "").toLowerCase();
      return msg.includes("failed to fetch") || msg.includes("network") || msg.includes("fetch");
    };

    // ── STEP 1: Restore from localStorage IMMEDIATELY (no network needed) ──────
    // This runs synchronously so a refresh always brings back the conversation
    // even when the backend is cold or unreachable.
    let restoredFromStorage = false;
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as {
          interviewId: string;
          messages: ConversationMessage[];
          candidateName?: string;
          candidateEmail?: string;
          jobInfo?: JobPublicInfo;
        };
        if (parsed.interviewId && Array.isArray(parsed.messages) && parsed.messages.length > 0) {
          if (parsed.jobInfo) setJobInfo(parsed.jobInfo);
          setApplicationId(parsed.interviewId);
          setCandidateName(parsed.candidateName ?? "");
          setCandidateEmail(parsed.candidateEmail ?? "");
          setMessages(parsed.messages);
          setScreen("conversation");
          restoredFromStorage = true;
        }
      }
    } catch { /* ignore */ }

    // ── STEP 2: Always fetch fresh job info from backend ─────────────────────
    // After a restore: updates jobInfo in the background, checks the job is still active.
    // Without a restore: loads jobInfo so the welcome screen can render.
    const load = async (attempt = 1): Promise<void> => {
      try {
        const info = await interviewAPI.getJobInfo(token);
        if (cancelled) return;
        backendWarmRef.current = true;
        setJobInfo(info);
        // Only move to welcome if nothing was restored from storage
        if (!restoredFromStorage && !cancelled) {
          setScreen((prev) => prev === "loading" ? "welcome" : prev);
        }
      } catch (err: unknown) {
        if (cancelled) return;
        // Render free-tier cold-start: retry up to 4 times with increasing delay.
        if (isNetworkError(err) && attempt <= 4) {
          const delay = attempt === 1 ? 8_000 : attempt === 2 ? 15_000 : attempt === 3 ? 20_000 : 25_000;
          // Only show "connecting" subtext when on loading screen (no restore happened)
          if (!restoredFromStorage && !cancelled) setLoadingSubtext("Connecting to server…");
          await new Promise((r) => setTimeout(r, delay));
          if (!cancelled) await load(attempt + 1);
          return;
        }
        // Only show error screen if there was no saved session to fall back on
        if (!restoredFromStorage) {
          setErrorMsg(classifyError((err instanceof Error ? err.message : "").toLowerCase()));
          setScreen("error");
        }
        // If a session was restored and the backend is dead, the user can still
        // see their conversation — they just won't be able to send new messages yet.
      }
    };

    load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ── Persist conversation to localStorage on every message change ─────────
  useEffect(() => {
    if (!applicationId || messages.length === 0) return;
    try {
      // Strip animate flags before persisting — restored messages must not
      // re-type after a refresh.
      const toSave = messages
        .filter((m) => !m.isTyping)
        .map((m) => {
          if (!m.animate && !m.animateDelayMs) return m;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { animate: _a, animateDelayMs: _d, ...rest } = m;
          return rest;
        });
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        interviewId: applicationId,
        messages: toSave,
        candidateName,
        candidateEmail,
        jobInfo,
      }));
    } catch { /* ignore */ }
  }, [messages, applicationId, token, candidateName, candidateEmail, jobInfo, SESSION_KEY]);

  // ── Progress ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const candidateMsgs = messages.filter((m) => m.role === "candidate").length;
    const total = jobInfo?.question_count ?? 10;
    setProgressPct(Math.min(88, Math.round((candidateMsgs / total) * 100)));
  }, [messages, jobInfo]);

  // ── Clear bar state when pending action changes ────────────────────────────
  useEffect(() => {
    setBarError("");
    setIsUploading(false);
    setUploadProgress(0);
    setUploadFileName("");
    setLinkValue("");
    setUploadQueue([]);
  }, [pendingAction]);

  // ── Start application — no auth screen, anonymous session ────────────────
  // Generates a unique anonymous email so the backend can create/resume a session.
  // The AI collects the candidate's real name and email conversationally.
  const handleStartApplication = useCallback(async () => {
    if (!jobInfo) return;
    if (isStartingRef.current) return;
    isStartingRef.current = true;
    setIsStartingSession(true);

    if (!backendWarmRef.current) {
      wakeBackend();
      await waitForBackendWarm(55_000);
      backendWarmRef.current = true;
    }

    // Generate a unique anonymous identity for this session
    const sessionId = nanoid();
    const anonEmail = `anon_${sessionId}@session.hireiq`;

    const tryStart = async (attempt = 1): Promise<typeof interviewAPI.startInterview extends (...a: never[]) => Promise<infer R> ? R : never> => {
      try {
        return await interviewAPI.startInterview(token, "", anonEmail);
      } catch (err: unknown) {
        const msg = (err instanceof Error ? err.message : "").toLowerCase();
        if ((msg.includes("failed to fetch") || msg.includes("network")) && attempt === 1) {
          wakeBackend();
          await waitForBackendWarm(55_000);
          backendWarmRef.current = true;
          return tryStart(2);
        }
        throw err;
      }
    };

    try {
      const r = await tryStart();
      setApplicationId(r.interview_id);
      setScreen("conversation");
      await kickoffConversation(r.interview_id, false, []);
    } catch {
      isStartingRef.current = false;
      setIsStartingSession(false);
    }
  }, [jobInfo, token]);

  // ── Kick off conversation (first AI message) ───────────────────────────────
  const initialized = useRef(false);

  const kickoffConversation = useCallback(async (appId: string, resumed: boolean, existingConv: unknown[]) => {
    // Guard: React concurrent mode can invoke this twice. Only the first call proceeds.
    if (initialized.current) return;
    initialized.current = true;
    kickoffCalledRef.current = true;

    const thinkingId = nanoid();
    const aiMsgId    = nanoid();
    const isFirst    = !resumed || existingConv.length === 0;

    setMessages((prev) => {
      const base = resumed && existingConv.length ? prev : [];
      return [...base, {
        id: thinkingId, role: "ai", content: "", timestamp: new Date().toISOString(), isTyping: true,
      }];
    });

    // Hold the thinking dots for 2.5s on a fresh kickoff so the message
    // doesn't pop the instant the page loads.
    const minHoldUntil = isFirst ? Date.now() + 2500 : 0;
    const waitForHold = async () => {
      const remaining = minHoldUntil - Date.now();
      if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
    };

    let firstTokenSeen = false;

    const handleEvent = (ev: import("@/lib/api").StreamEvent): void => {
      if (ev.type === "first" || ev.type === "resume" || ev.type === "knockout") {
        setMessages((prev) =>
          prev.filter((m) => m.id !== thinkingId).concat([{
            id:                aiMsgId,
            role:              "ai",
            content:           ev.message,
            timestamp:         new Date().toISOString(),
            action:            ev.action,
            requirement_id:    "requirement_id" in ev ? ev.requirement_id : null,
            requirement_label: "requirement_label" in ev ? ev.requirement_label : null,
            cardStatus:        (ev.action === "request_file" || ev.action === "request_link") ? "idle" : undefined,
          }])
        );
        return;
      }
      if (ev.type === "token") {
        if (!firstTokenSeen) {
          firstTokenSeen = true;
          setMessages((prev) =>
            prev.filter((m) => m.id !== thinkingId).concat([{
              id:        aiMsgId,
              role:      "ai",
              content:   ev.text,
              timestamp: new Date().toISOString(),
              action:    "continue",
            }])
          );
        } else {
          setMessages((prev) => prev.map((m) =>
            m.id === aiMsgId ? { ...m, content: m.content + ev.text } : m
          ));
        }
        return;
      }
      if (ev.type === "done") {
        setMessages((prev) => prev.map((m) => {
          if (m.id !== aiMsgId) return m;
          return {
            ...m,
            content:           ev.message,
            action:            ev.action,
            requirement_id:    ev.requirement_id,
            requirement_label: ev.requirement_label,
            cardStatus:        (ev.action === "request_file" || ev.action === "request_link") ? "idle" : undefined,
          };
        }));
        return;
      }
      if (ev.type === "error") {
        setMessages((prev) => prev.filter((m) => m.id !== thinkingId && m.id !== aiMsgId));
        setAiError(ev.message);
      }
    };

    const attemptStream = async () => {
      await waitForHold();
      await interviewAPI.streamMessage(appId, "", handleEvent);
    };

    try {
      await attemptStream();
    } catch {
      try {
        setAiError("Server is warming up, this takes a few seconds. Retrying…");
        wakeBackend();
        await waitForBackendWarm(55_000);
        backendWarmRef.current = true;
        setAiError("");
        await attemptStream();
      } catch {
        setMessages((prev) => prev.filter((m) => m.id !== thinkingId && m.id !== aiMsgId));
        initialized.current = false;
        kickoffCalledRef.current = false;
        setAiError("Could not connect to the AI. Please refresh the page to try again.");
      }
    }
  }, []);

  // ── Shared: post auto candidate message + stream next AI reply ───────────
  const sendAutoMessage = useCallback(async (text: string) => {
    setIsWaitingForAI(true);
    const thinkingId = nanoid();
    const aiMsgId    = nanoid();
    setMessages((prev) => [
      ...prev,
      { id: nanoid(), role: "candidate", content: text, timestamp: new Date().toISOString() },
      { id: thinkingId, role: "ai", content: "", timestamp: new Date().toISOString(), isTyping: true },
    ]);

    let firstTokenSeen = false;
    let didComplete    = false;

    try {
      await interviewAPI.streamMessage(applicationId, text, (ev) => {
        if (ev.type === "first" || ev.type === "resume" || ev.type === "knockout") {
          setMessages((prev) => prev.filter((m) => m.id !== thinkingId).concat([{
            id:                aiMsgId,
            role:              "ai",
            content:           ev.message,
            timestamp:         new Date().toISOString(),
            action:            ev.action,
            requirement_id:    "requirement_id" in ev ? ev.requirement_id : null,
            requirement_label: "requirement_label" in ev ? ev.requirement_label : null,
            cardStatus:        (ev.action === "request_file" || ev.action === "request_link") ? "idle" : undefined,
          }]));
          if (ev.action === "complete") didComplete = true;
        } else if (ev.type === "token") {
          if (!firstTokenSeen) {
            firstTokenSeen = true;
            setMessages((prev) => prev.filter((m) => m.id !== thinkingId).concat([{
              id:        aiMsgId,
              role:      "ai",
              content:   ev.text,
              timestamp: new Date().toISOString(),
              action:    "continue",
            }]));
          } else {
            setMessages((prev) => prev.map((m) =>
              m.id === aiMsgId ? { ...m, content: m.content + ev.text } : m
            ));
          }
        } else if (ev.type === "done") {
          setMessages((prev) => prev.map((m) => {
            if (m.id !== aiMsgId) return m;
            return {
              ...m,
              content:           ev.message,
              action:            ev.action,
              requirement_id:    ev.requirement_id,
              requirement_label: ev.requirement_label,
              cardStatus:        (ev.action === "request_file" || ev.action === "request_link") ? "idle" : undefined,
            };
          }));
          if (ev.action === "complete") didComplete = true;
        } else if (ev.type === "error") {
          setMessages((prev) => prev.filter((m) => m.id !== thinkingId && m.id !== aiMsgId));
          setAiError(ev.message);
        }
      });
      if (didComplete) {
        setProgressPct(100);
        setApplicationComplete(true);
        setTimeout(() => setScreen("review"), 1800);
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== thinkingId));
      setAiError("Could not continue. Please try again.");
    } finally {
      setIsWaitingForAI(false);
    }
  }, [applicationId]);

  // ── Send candidate message ─────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || isWaitingForAI || hasCardPending || applicationComplete) return;

    setInputValue("");
    if (inputRef.current) inputRef.current.style.height = "42px";
    setAiError("");
    setIsWaitingForAI(true);

    const now   = new Date().toISOString();
    const nowMs = Date.now();
    const showTs = (nowMs - lastShownTime.current) > 60_000;
    if (showTs) lastShownTime.current = nowMs;

    const thinkingId = nanoid();
    setMessages((prev) => [
      ...prev,
      { id: nanoid(), role: "candidate", content: text, timestamp: now, showTimestamp: showTs },
      { id: thinkingId, role: "ai", content: "", timestamp: now, isTyping: true },
    ]);

    const aiMsgId       = nanoid();
    let firstTokenSeen  = false;
    let didComplete     = false;

    try {
      await interviewAPI.streamMessage(applicationId, text, (ev) => {
        if (ev.type === "first" || ev.type === "resume" || ev.type === "knockout") {
          setMessages((prev) => prev.filter((m) => m.id !== thinkingId).concat([{
            id:                aiMsgId,
            role:              "ai",
            content:           ev.message,
            timestamp:         new Date().toISOString(),
            action:            ev.action,
            requirement_id:    "requirement_id" in ev ? ev.requirement_id : null,
            requirement_label: "requirement_label" in ev ? ev.requirement_label : null,
            cardStatus:        (ev.action === "request_file" || ev.action === "request_link") ? "idle" : undefined,
          }]));
          if (ev.action === "complete") didComplete = true;
        } else if (ev.type === "token") {
          if (!firstTokenSeen) {
            firstTokenSeen = true;
            setMessages((prev) => prev.filter((m) => m.id !== thinkingId).concat([{
              id:        aiMsgId,
              role:      "ai",
              content:   ev.text,
              timestamp: new Date().toISOString(),
              action:    "continue",
            }]));
          } else {
            setMessages((prev) => prev.map((m) =>
              m.id === aiMsgId ? { ...m, content: m.content + ev.text } : m
            ));
          }
        } else if (ev.type === "done") {
          setMessages((prev) => prev.map((m) => {
            if (m.id !== aiMsgId) return m;
            return {
              ...m,
              content:           ev.message,
              action:            ev.action,
              requirement_id:    ev.requirement_id,
              requirement_label: ev.requirement_label,
              cardStatus:        (ev.action === "request_file" || ev.action === "request_link") ? "idle" : undefined,
            };
          }));
          if (ev.action === "complete") didComplete = true;
        } else if (ev.type === "error") {
          setMessages((prev) => prev.filter((m) => m.id !== thinkingId && m.id !== aiMsgId));
          setAiError(ev.message);
        }
      });
      if (didComplete) {
        setProgressPct(100);
        setApplicationComplete(true);
        setTimeout(() => setScreen("review"), 1800);
      }
    } catch (err: unknown) {
      setMessages((prev) => prev.filter((m) => m.id !== thinkingId && m.id !== aiMsgId));
      setAiError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsWaitingForAI(false);
      // Intentionally NOT auto-focusing the input, the bar stays collapsed
      // and only expands when the candidate clicks it themselves.
    }
  }, [inputValue, isWaitingForAI, hasCardPending, applicationComplete, applicationId]);

  // ── Bar-level file upload ──────────────────────────────────────────────────
  const handlePageFile = useCallback(async (files: FileList | File[]) => {
    if (!lastAiMsg) return;
    const fileArray = Array.from(files);
    if (!fileArray.length) return;

    const MAX = 10 * 1024 * 1024;
    const first = fileArray[0];
    if (first.size > MAX) { setBarError("File exceeds 10 MB. Please choose a smaller file."); return; }

    setBarError("");
    setIsUploading(true);
    setUploadFileName(fileArray.length > 1 ? `${fileArray.length} files` : fileArray[0].name);
    setUploadProgress(0);

    const msgId    = lastAiMsg.id;
    const reqId    = lastAiMsg.requirement_id ?? "";
    const reqLabel = lastAiMsg.requirement_label ?? "file";

    let lastFileName = "";
    let lastFileSize = 0;
    try {
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        if (fileArray.length > 1) setUploadFileName(`Uploading ${i + 1} of ${fileArray.length}…`);
        await interviewAPI.uploadFile(
          applicationId,
          `${reqId}${fileArray.length > 1 ? `-${i}` : ""}`,
          reqLabel,
          reqId,
          file,
          (pct) => setUploadProgress(pct),
        );
        lastFileName = file.name;
        lastFileSize = file.size;
      }

      setIsUploading(false);
      const displayName = fileArray.length > 1
        ? `${fileArray.length} files uploaded`
        : lastFileName;
      setMessages((prev) => prev.map((m) =>
        m.id === msgId
          ? { ...m, cardStatus: "complete", cardFileName: displayName, cardFileSize: fileArray.length === 1 ? lastFileSize : undefined }
          : m,
      ));
      const autoText = fileArray.length > 1
        ? `I've uploaded ${fileArray.length} files for my ${reqLabel}.`
        : `I've uploaded my ${reqLabel}.`;
      await sendAutoMessage(autoText);
    } catch (e) {
      setIsUploading(false);
      setBarError(e instanceof Error ? e.message : "Upload failed. Please try again.");
    }
  }, [lastAiMsg, applicationId, sendAutoMessage]);

  // ── Bar-level link submit ──────────────────────────────────────────────────
  const handlePageLink = useCallback(async () => {
    if (!lastAiMsg) return;
    const cleaned = linkValue.trim();
    if (!cleaned.startsWith("http://") && !cleaned.startsWith("https://")) {
      setBarError("URL must start with http:// or https://");
      return;
    }

    setBarError("");
    const msgId    = lastAiMsg.id;
    const reqId    = lastAiMsg.requirement_id ?? "";
    const reqLabel = lastAiMsg.requirement_label ?? "link";

    try {
      await interviewAPI.submitLink(applicationId, reqId, reqLabel, cleaned);
      setMessages((prev) => prev.map((m) =>
        m.id === msgId ? { ...m, cardStatus: "complete", cardUrl: cleaned } : m,
      ));
      setLinkValue("");
      await sendAutoMessage(`Here's my ${reqLabel}: ${cleaned}`);
    } catch (e) {
      setBarError(e instanceof Error ? e.message : "Submission failed. Please try again.");
    }
  }, [lastAiMsg, linkValue, applicationId, sendAutoMessage]);

  // ── Keyboard handler ───────────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // ── Auto-resize textarea ───────────────────────────────────────────────────
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, []);

  // ── Review screen submit ───────────────────────────────────────────────────
  const handleConfirmSubmit = useCallback(async () => {
    if (!applicationId) return;
    setIsSubmitting(true);
    setSubmitError("");
    try {
      // If the candidate edited any answers in the review screen, persist the
      // updated transcript before marking the interview complete so the
      // employer + scoring engine see the corrected text.
      const hasAnswerEdits = Object.keys(answerEdits).length > 0;
      const hasDetailEdits = Object.keys(detailEdits).length > 0;
      if (hasAnswerEdits || hasDetailEdits) {
        const editedTranscript = messages.map((m) => {
          if (m.role === "candidate" && answerEdits[m.id] !== undefined) {
            return { ...m, content: answerEdits[m.id] };
          }
          return m;
        });
        // Append a synthetic "candidate corrections" turn so the personal-detail
        // edits are visible to the scoring engine even if they don't map 1:1
        // to existing transcript turns.
        if (hasDetailEdits) {
          const correctionsText = Object.entries(detailEdits)
            .map(([k, v]) => `${k}: ${v}`)
            .join("\n");
          editedTranscript.push({
            id:        `corrections-${Date.now()}`,
            role:      "candidate",
            content:   `Corrections from review screen:\n${correctionsText}`,
            timestamp: new Date().toISOString(),
          });
        }
        try {
          await interviewAPI.submitInterview(applicationId, editedTranscript as never);
        } catch (saveErr) {
          // Don't block submission on save failure — the interview already has
          // the original transcript saved server-side. Just log it.
          console.warn("Failed to persist transcript edits:", saveErr);
        }
      }

      await interviewAPI.confirmSubmission(applicationId);
      // Clear saved session — application is done
      try { localStorage.removeItem(`hireiq_apply_${token}`); } catch { /* ignore */ }
      setScreen("complete");
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Submission failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }, [applicationId, answerEdits, detailEdits, messages, token]);

  // ── Screens ────────────────────────────────────────────────────────────────

  if (screen === "loading") {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center gap-4">
        <Mark className="w-7 h-7 text-muted" />
        <p className="text-[13px] text-muted">{loadingSubtext || "Loading…"}</p>
      </div>
    );
  }

  if (screen === "welcome") {
    return (
      <WelcomeScreen
        jobInfo={jobInfo!}
        onStart={handleStartApplication}
        isStarting={isStartingSession}
      />
    );
  }

  if (screen === "error") {
    const isPositionClosed = ["closed", "paused", "deadline", "limit"].includes(errorMsg);

    const errorContent = {
      closed: {
        heading: "This position is no longer accepting applications.",
        body: "The company has closed this role. Check back later or visit their careers page for other openings.",
        icon: (
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10 mx-auto text-muted">
            <circle cx="24" cy="24" r="20" />
            <line x1="15" y1="24" x2="33" y2="24" />
          </svg>
        ),
      },
      paused: {
        heading: "Applications for this position are temporarily paused.",
        body: "The hiring team has paused new applications. Please check back later — this link will become active again once applications reopen.",
        icon: (
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10 mx-auto text-muted">
            <circle cx="24" cy="24" r="20" />
            <rect x="17" y="16" width="5" height="16" rx="1" />
            <rect x="26" y="16" width="5" height="16" rx="1" />
          </svg>
        ),
      },
      deadline: {
        heading: "The application deadline for this position has passed.",
        body: "This role is no longer accepting new applications. Contact the company directly if you believe this is an error.",
        icon: (
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10 mx-auto text-muted">
            <rect x="8" y="12" width="32" height="30" rx="2" />
            <line x1="16" y1="8" x2="16" y2="16" />
            <line x1="32" y1="8" x2="32" y2="16" />
            <line x1="8" y1="22" x2="40" y2="22" />
            <line x1="24" y1="30" x2="24" y2="36" />
            <line x1="18" y1="33" x2="30" y2="33" />
          </svg>
        ),
      },
      limit: {
        heading: "This position has reached its maximum number of applications.",
        body: "The company is no longer accepting new applications for this role at this time.",
        icon: (
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10 mx-auto text-muted">
            <circle cx="24" cy="24" r="20" />
            <path d="M16 32c0-4.4 3.6-8 8-8s8 3.6 8 8" />
            <circle cx="24" cy="20" r="5" />
          </svg>
        ),
      },
      not_found: {
        heading: "This application link is not valid.",
        body: "The link you followed may be incorrect or has been removed. Please check the URL and try again.",
        icon: (
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10 mx-auto text-muted">
            <circle cx="24" cy="24" r="20" />
            <line x1="24" y1="16" x2="24" y2="26" />
            <circle cx="24" cy="32" r="1.5" fill="currentColor" />
          </svg>
        ),
      },
      unknown: {
        heading: "Something went wrong.",
        body: "We couldn't load this application. Please refresh the page or try again later.",
        icon: (
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10 mx-auto text-muted">
            <circle cx="24" cy="24" r="20" />
            <line x1="24" y1="16" x2="24" y2="26" />
            <circle cx="24" cy="32" r="1.5" fill="currentColor" />
          </svg>
        ),
      },
    }[errorMsg] ?? {
      heading: "Something went wrong.",
      body: "We couldn't load this application. Please refresh the page or try again later.",
      icon: null,
    };

    return (
      <div className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-4 py-12" dir="ltr">
        <div className="max-w-[400px] w-full text-center space-y-6">
          <Mark className="w-6 h-6 text-muted mx-auto" />

          <div className="bg-white border border-border rounded-[4px] p-8 space-y-4">
            {errorContent.icon}

            <div className="space-y-2">
              <h1 className="text-[17px] font-semibold text-ink leading-snug"
                style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                {errorContent.heading}
              </h1>
              <p className="text-[13px] text-sub leading-relaxed">
                {errorContent.body}
              </p>
            </div>

            {isPositionClosed && (
              <div className="pt-2 border-t border-border">
                <p className="text-[11px] text-muted">
                  If you think this is a mistake, please contact the hiring team directly.
                </p>
              </div>
            )}
          </div>

          <p className="text-[11px] text-muted">Secured by HireIQ</p>
        </div>
      </div>
    );
  }

  // "auth" screen removed — candidates go directly from welcome to conversation

  // ── Review screen ──────────────────────────────────────────────────────────
  if (screen === "review") {
    const { fields: rawFields, openAnswers } = extractReviewSections(
      messages, candidateName, candidateEmail,
    );

    // Apply edits + compute live validation errors per field.
    const structuredFields = rawFields.map((f) => {
      const editedValue = detailEdits[f.label];
      const value = editedValue !== undefined ? editedValue : f.value;
      const error = validateField(value, f.type, f.required);
      return { ...f, value, error };
    });

    const submittedDocs = messages.filter(
      (m) => m.role === "ai" && m.cardStatus === "complete",
    );

    const fieldErrors      = structuredFields.filter((f) => f.error);
    const emptyOpenAnswers = openAnswers.filter(
      (a) => !((answerEdits[a.id] !== undefined ? answerEdits[a.id] : a.answer).trim()),
    );
    const blockingCount = fieldErrors.length + emptyOpenAnswers.length;
    const canSubmit     = blockingCount === 0 && !isSubmitting;

    return (
      <div
        className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-start px-4 py-12 animate-slide-up"
        dir="ltr"
      >
        <div className="max-w-[640px] w-full space-y-5">
          {/* Header */}
          <div className="text-center space-y-2">
            <Mark className="w-7 h-7 text-ink mx-auto" />
            <h1 className="text-[26px] font-bold text-ink leading-tight"
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
              Review your application
            </h1>
            <p className="text-[13px] text-sub">
              Nothing has been submitted yet. Check everything before it goes to{" "}
              <strong>{jobInfo?.company_name}</strong>. You can edit any field below.
            </p>
          </div>

          {/* Structured fields — show clean extracted values, edit inline */}
          {structuredFields.length > 0 && (
            <div className="bg-white border border-border rounded-[4px] overflow-hidden">
              <div className="px-5 py-3 border-b border-border bg-[var(--bg)]">
                <h2 className="text-[11px] font-semibold text-sub uppercase tracking-wider">Your Details</h2>
              </div>
              <div className="divide-y divide-border">
                {structuredFields.map((f) => {
                  const isYesNo  = f.type === "yes_no";
                  const inputBase = "flex-1 text-[13px] text-ink bg-transparent border outline-none transition-colors px-2 py-1.5 rounded-[4px] placeholder:text-muted";
                  const inputClass = `${inputBase} ${f.error
                    ? "border-danger focus:border-danger"
                    : "border-transparent hover:border-border focus:border-ink"}`;
                  return (
                    <div key={f.label} className="px-5 py-3 space-y-1.5">
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-[12px] text-muted shrink-0 w-32 pt-1.5">
                          {f.label}{f.required && <span className="text-danger ml-0.5">*</span>}
                        </span>
                        {isYesNo ? (
                          <select
                            value={/^y(es)?$|^true$/i.test(f.value.trim()) ? "Yes"
                                 : /^n(o)?$|^false$/i.test(f.value.trim()) ? "No"
                                 : f.value}
                            onChange={(e) =>
                              setDetailEdits((prev) => ({ ...prev, [f.label]: e.target.value }))
                            }
                            className={inputClass}
                            style={{ textAlign: "left" }}
                          >
                            <option value="">—</option>
                            <option value="Yes">Yes</option>
                            <option value="No">No</option>
                          </select>
                        ) : (
                          <input
                            type={f.type === "email" ? "email"
                                : f.type === "phone" ? "tel"
                                : f.type === "date"  ? "text"
                                : f.type === "number" ? "text"
                                : "text"}
                            inputMode={f.type === "phone" ? "tel"
                                     : f.type === "number" ? "numeric"
                                     : "text"}
                            value={f.value}
                            placeholder={f.required ? "Required" : "Optional"}
                            dir="ltr"
                            onChange={(e) =>
                              setDetailEdits((prev) => ({ ...prev, [f.label]: e.target.value }))
                            }
                            className={inputClass}
                            style={{ textAlign: "left" }}
                          />
                        )}
                      </div>
                      {f.error && (
                        <p className="text-[11px] text-danger ml-32 pl-2 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 shrink-0" />
                          {f.error}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Documents submitted */}
          {submittedDocs.length > 0 && (
            <div className="bg-white border border-border rounded-[4px] overflow-hidden">
              <div className="px-5 py-3 border-b border-border bg-[var(--bg)]">
                <h2 className="text-[11px] font-semibold text-sub uppercase tracking-wider">Documents Submitted</h2>
              </div>
              <div className="divide-y divide-border">
                {submittedDocs.map((m) => (
                  <div key={m.id} className="px-5 py-3 flex items-start gap-3">
                    <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] text-muted capitalize">
                        {m.requirement_label ?? (m.action === "request_file" ? "Document" : "Link")}
                      </p>
                      {m.action === "request_file" ? (
                        <p className="text-[13px] text-ink truncate mt-0.5">
                          {m.cardFileName}
                          {m.cardFileSize != null && (
                            <span className="text-muted ml-2 text-[11px]">{formatSize(m.cardFileSize)}</span>
                          )}
                        </p>
                      ) : (
                        <a
                          href={m.cardUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[13px] text-ink underline underline-offset-2 truncate block mt-0.5 hover:text-muted transition-colors"
                        >
                          {m.cardUrl}
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Open-ended answers — full original text, fully editable */}
          {openAnswers.length > 0 && (
            <div className="bg-white border border-border rounded-[4px] overflow-hidden">
              <div className="px-5 py-3 border-b border-border bg-[var(--bg)]">
                <h2 className="text-[11px] font-semibold text-sub uppercase tracking-wider">Your Answers</h2>
              </div>
              <div className="divide-y divide-border">
                {openAnswers.map(({ id, question, answer }, idx) => {
                  const currentValue = answerEdits[id] !== undefined ? answerEdits[id] : answer;
                  const isEmpty      = !currentValue.trim();
                  return (
                    <div key={id} className="px-5 py-4 space-y-2">
                      <p className="text-[11px] text-muted leading-snug">
                        Q{idx + 1}. {question}
                      </p>
                      <textarea
                        value={currentValue}
                        dir="ltr"
                        rows={Math.min(8, Math.max(2, Math.ceil(currentValue.length / 60)))}
                        onChange={(e) =>
                          setAnswerEdits((prev) => ({ ...prev, [id]: e.target.value }))
                        }
                        className={`w-full text-[13px] text-ink leading-relaxed bg-transparent border rounded-[4px] px-3 py-2 outline-none transition-colors resize-y ${
                          isEmpty
                            ? "border-danger focus:border-danger"
                            : "border-border focus:border-ink"
                        }`}
                        style={{ textAlign: "left" }}
                      />
                      {isEmpty && (
                        <p className="text-[11px] text-danger flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 shrink-0" />
                          This answer can&apos;t be empty.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Block summary — shown when validation fails */}
          {blockingCount > 0 && (
            <div className="flex items-start gap-2 rounded-[4px] bg-red-50 border border-danger/20 px-3 py-2.5 text-[13px] text-danger">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Please fix the highlighted fields before submitting.</span>
            </div>
          )}

          {/* Submit error */}
          {submitError && (
            <div className="flex items-start gap-2 rounded-[4px] bg-red-50 border border-danger/20 px-3 py-2.5 text-[13px] text-danger">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {submitError}
            </div>
          )}

          {/* Mandatory review-instruction line + single Submit button */}
          <div className="space-y-3 pt-1">
            <p className="text-[12px] text-sub text-center leading-relaxed px-2">
              Take a moment to review your answers. This is your last chance to
              make changes before submitting. Nothing reaches{" "}
              <strong>{jobInfo?.company_name}</strong> until you click Submit.
            </p>
            <button
              onClick={handleConfirmSubmit}
              disabled={!canSubmit}
              className="w-full bg-[#1A1714] text-white rounded-[4px] px-4 py-3.5 text-[14px] font-semibold hover:bg-[#2d2926] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <><Spinner className="w-4 h-4" /> Submitting…</>
              ) : (
                <>Submit Application <ChevronRight className="w-4 h-4" /></>
              )}
            </button>
          </div>

          <p className="text-[11px] text-muted text-center pb-4">
            By submitting, you confirm all answers are genuinely your own.
          </p>
        </div>
      </div>
    );
  }

  // ── Complete screen ────────────────────────────────────────────────────────
  if (screen === "complete") {
    const company = jobInfo?.company_name ?? "the company";
    const role    = jobInfo?.title ?? "this role";
    return (
      <div
        className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-6 animate-slide-up"
        dir="ltr"
      >
        <div className="max-w-md w-full text-center space-y-6">
          <svg className="w-14 h-14 mx-auto text-ink" viewBox="0 0 48 48" fill="none"
            stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="24" cy="24" r="22" />
            <polyline points="14 24 21 31 34 17" />
          </svg>
          <h1
            className="text-[32px] font-bold text-ink leading-tight"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            Application Submitted
          </h1>
          <div className="text-[14px] text-sub leading-relaxed space-y-4">
            <p>
              Thank you for applying for the <strong>{role}</strong> role at{" "}
              <strong>{company}</strong>. We&apos;ve received everything we need.
              Our team will be in touch if you&apos;re selected to move forward.
            </p>
            <p>We wish you the very best.</p>
            <p className="text-ink">— The {company} Team</p>
          </div>
          <div className="pt-2">
            <button
              onClick={() => { try { window.close(); } catch { /* ignore */ } }}
              className="text-[12px] text-muted hover:text-ink transition-colors underline underline-offset-4"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── CONVERSATION ───────────────────────────────────────────────────────────
  const canSend = inputValue.trim().length > 0 && !isWaitingForAI && !hasCardPending && !applicationComplete;

  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col" dir="ltr">
      <TopBar
        company={jobInfo?.company_name ?? ""}
        title={jobInfo?.title ?? ""}
        progress={progressPct}
      />

      <input
        ref={pageFileRef}
        type="file"
        accept="*/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          if (files && files.length > 0) handlePageFile(files);
          e.target.value = "";
        }}
      />

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto" dir="ltr">
        <div className="max-w-[680px] mx-auto px-4 py-8 space-y-6 pb-40">
          {messages.map((msg, i) => {
            if (msg.role === "ai") {
              return <AIMessageBubble key={msg.id} message={msg} />;
            }
            const msgTime  = new Date(msg.timestamp).getTime();
            const prevMsg  = messages[i - 1];
            const prevTime = prevMsg ? new Date(prevMsg.timestamp).getTime() : 0;
            const showTs   = (msgTime - prevTime) > 60_000;
            return (
              <CandidateMessageBubble
                key={msg.id}
                content={msg.content}
                timestamp={msg.timestamp}
                showTimestamp={showTs}
              />
            );
          })}

          {applicationComplete && screen === "conversation" && (
            <div className="flex flex-col items-center gap-3 py-4">
              <p className="text-[13px] text-muted text-center">
                Your application is complete. Review it before submitting.
              </p>
              <button
                onClick={() => setScreen("review")}
                className="flex items-center gap-1.5 bg-[#1A1714] text-white rounded-[4px] px-5 py-2.5 text-[13px] font-semibold hover:bg-[#2d2926] transition-colors"
              >
                Review &amp; Submit <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Fixed bottom input bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-[var(--bg)] border-t border-border" dir="ltr">
        <div className="max-w-[680px] mx-auto px-4 py-3">
          {(aiError || barError) && (
            <p className="text-[12px] text-danger mb-2 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {aiError || barError}
            </p>
          )}

          {/* FILE ATTACH BAR */}
          {pendingAction === "request_file" && !applicationComplete && (
            isUploading ? (
              <div className="space-y-1.5 py-1">
                <div className="flex justify-between text-[12px] text-sub">
                  <span className="truncate">{uploadFileName}</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-1.5 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-ink rounded-full transition-all duration-150"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { setBarError(""); pageFileRef.current?.click(); }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const files = e.dataTransfer.files;
                  if (files && files.length > 0) { setBarError(""); handlePageFile(files); }
                }}
                className="w-full flex items-center gap-3 border-2 border-dashed border-border rounded-[4px] px-4 py-3 hover:border-ink transition-colors group cursor-pointer"
              >
                <Paperclip className="w-4 h-4 text-muted group-hover:text-ink transition-colors shrink-0" />
                <span className="text-[13px] text-sub group-hover:text-ink transition-colors text-left">
                  Attach {lastAiMsg?.requirement_label ?? "document"}
                  <span className="ml-2 text-[11px] text-muted font-normal">
                    PDF, Word, image · max 10 MB
                  </span>
                </span>
              </button>
            )
          )}

          {/* LINK INPUT BAR */}
          {pendingAction === "request_link" && !applicationComplete && (
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 bg-white border border-border rounded-[4px] px-3 py-2.5 focus-within:border-ink transition-colors">
                <Link2 className="w-4 h-4 text-muted shrink-0" />
                <input
                  type="url"
                  value={linkValue}
                  onChange={(e) => { setLinkValue(e.target.value); setBarError(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") handlePageLink(); }}
                  placeholder={`Paste your ${lastAiMsg?.requirement_label ?? "link"} here…`}
                  disabled={isWaitingForAI}
                  autoFocus
                  dir="ltr"
                  className="flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-muted disabled:opacity-50"
                />
              </div>
              <button
                onClick={handlePageLink}
                disabled={!linkValue.trim() || isWaitingForAI}
                className="w-9 h-9 rounded-[4px] bg-[#1A1714] text-white flex items-center justify-center hover:bg-[#2d2926] transition-colors disabled:opacity-30 shrink-0"
              >
                {isWaitingForAI
                  ? <Spinner className="w-3.5 h-3.5" />
                  : <Send className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}

          {/* NORMAL TEXTAREA */}
          {pendingAction === "continue" && (
            applicationComplete ? (
              <button
                onClick={() => setScreen("review")}
                className="w-full flex items-center justify-center gap-2 bg-[#1A1714] text-white rounded-[4px] px-4 py-3 text-[13px] font-semibold hover:bg-[#2d2926] transition-colors"
              >
                Review &amp; Submit application <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <>
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    value={inputValue}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Type your answer…"
                    disabled={isWaitingForAI}
                    rows={1}
                    dir="ltr"
                    className="flex-1 bg-white border border-border rounded-[4px] px-3 py-2.5 text-[14px] text-ink outline-none resize-none overflow-y-auto placeholder:text-muted transition-colors focus:border-ink disabled:opacity-50"
                    style={{ minHeight: "42px", maxHeight: "160px", textAlign: "left" }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!canSend}
                    className="w-9 h-9 rounded-[4px] bg-[#1A1714] text-white flex items-center justify-center hover:bg-[#2d2926] transition-colors disabled:opacity-30 shrink-0"
                  >
                    {isWaitingForAI
                      ? <Spinner className="w-3.5 h-3.5" />
                      : <Send className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-[11px] text-muted mt-1.5 hidden sm:block">
                  Press Enter to send · Shift+Enter for new line
                </p>
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}
