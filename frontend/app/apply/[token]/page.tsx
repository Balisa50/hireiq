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
import { supabase } from "@/lib/supabase";
import type { JobPublicInfo } from "@/lib/types";

// ── Types ──────────────────────────────────────────────────────────────────────

type Screen = "loading" | "welcome" | "auth" | "conversation" | "review" | "complete" | "error";

interface ConversationMessage {
  id: string;
  role: "ai" | "candidate";
  content: string;
  timestamp: string;
  isTyping?: boolean;
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

const PERSONAL_RE =
  /\b(your name|full name|email address|phone number|phone|location|where are you|currently based|currently employed|employment status|working at|confirm your)\b/i;

// ── Review helpers ─────────────────────────────────────────────────────────────

interface PersonalDetail { label: string; value: string }

function extractPersonalDetails(
  messages: ConversationMessage[],
  name: string,
  email: string,
): PersonalDetail[] {
  const details: PersonalDetail[] = [];
  if (name)  details.push({ label: "Name",  value: name });
  if (email) details.push({ label: "Email", value: email });

  const PATTERNS: { label: string; re: RegExp }[] = [
    { label: "Phone",      re: /phone|number/i },
    { label: "Location",   re: /location|based|city|country|where are you/i },
    { label: "Employment", re: /current.*employ|working at|current.*role|current.*position/i },
  ];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role !== "ai" || msg.isTyping || !msg.content) continue;
    for (const { label, re } of PATTERNS) {
      if (!details.find((d) => d.label === label) && re.test(msg.content) && msg.content.length < 200) {
        const next = messages[i + 1];
        if (next?.role === "candidate" && next.content.trim()) {
          details.push({ label, value: next.content.trim() });
        }
      }
    }
  }
  return details;
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
}: {
  jobInfo: JobPublicInfo;
  onStart: () => void;
}) {
  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-4 py-12" dir="ltr">
      <div className="max-w-[480px] w-full space-y-8">

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
        </div>

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
          className="w-full bg-[#1A1714] text-white rounded-[4px] px-4 py-3.5 text-[14px] font-semibold hover:bg-[#2d2926] transition-colors flex items-center justify-center gap-2"
        >
          Start Application <ChevronRight className="w-4 h-4" />
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
  return (
    <div className="flex items-start gap-3" dir="ltr">
      <div className="w-6 h-6 rounded-full bg-white border border-border flex items-center justify-center shrink-0 mt-1">
        {message.isTyping ? (
          <span className="w-1.5 h-4 bg-muted rounded-full animate-pulse inline-block" />
        ) : (
          <Mark className="w-3 h-3 text-muted" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        {message.isTyping ? (
          <span className="text-[16px] text-muted animate-pulse"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>_</span>
        ) : (
          <p className="text-[16px] text-ink leading-[1.75]"
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
        className="text-[15px] text-ink border-r-2 border-[#E8E4DF] pr-3.5 max-w-[85%] leading-relaxed"
        style={{ textAlign: "right", direction: "ltr" }}
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
  const [isAuthLoading, setIsAuthLoading]     = useState(false);
  const [googleLoading, setGoogleLoading]     = useState(false);
  const [authGlobalError, setAuthGlobalError] = useState("");
  const [candidateName, setCandidateName]     = useState("");
  const [candidateEmail, setCandidateEmail]   = useState("");

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

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef            = useRef<HTMLTextAreaElement>(null);
  const lastShownTime       = useRef<number>(0);
  const isStartingRef       = useRef(false);
  const kickoffCalledRef    = useRef(false);
  // Set to true once the backend has responded to at least one CORS GET.
  // Used as a gate before POST requests to avoid cold-start CORS errors.
  const backendWarmRef      = useRef(false);
  // Track whether this page session explicitly started a Google OAuth flow.
  // sessionStorage survives the OAuth redirect so we can distinguish a fresh
  // user-initiated sign-in from an automatic token-refresh event (both fire
  // SIGNED_IN in Supabase v2 and would otherwise cause the drain to auto-submit).
  const OAUTH_FLAG = "hireiq_oauth_pending";
  const [pendingOAuth, setPendingOAuth] = useState<{ name: string; email: string } | null>(null);

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

    const load = async (attempt = 1): Promise<void> => {
      try {
        const info = await interviewAPI.getJobInfo(token);
        if (cancelled) return;
        backendWarmRef.current = true; // backend returned a CORS GET → confirmed warm
        setJobInfo(info);
        setScreen((prev) => prev === "loading" ? "welcome" : prev);
      } catch (err: unknown) {
        if (cancelled) return;
        // Render free-tier cold-start: retry up to 4 times with increasing delay.
        // GET requests have no preflight (api.ts fix), so they reach Render even
        // when cold and wake the dyno — the retry will succeed once it's ready.
        if (isNetworkError(err) && attempt <= 4) {
          const delay = attempt === 1 ? 8_000 : attempt === 2 ? 15_000 : attempt === 3 ? 20_000 : 25_000;
          if (!cancelled) setLoadingSubtext("Connecting to server…");
          await new Promise((r) => setTimeout(r, delay));
          if (!cancelled) await load(attempt + 1);
          return;
        }
        setErrorMsg(classifyError((err instanceof Error ? err.message : "").toLowerCase()));
        setScreen("error");
      }
    };

    load();
    return () => { cancelled = true; };
  }, [token]);

  // ── Google OAuth return ────────────────────────────────────────────────────
  // Supabase processes the OAuth tokens from the URL hash during module
  // initialisation — BEFORE React mounts and effects run. That means
  // onAuthStateChange("SIGNED_IN") fires before we can subscribe, so we
  // always miss it. Instead: on mount, if OAUTH_FLAG is set, call getSession()
  // directly to read the session Supabase already established.
  useEffect(() => {
    if (typeof sessionStorage === "undefined") return;
    if (!sessionStorage.getItem(OAUTH_FLAG)) return;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return; // OAuth hasn't completed or failed — leave flag for next load
      sessionStorage.removeItem(OAUTH_FLAG);
      const fullName = (
        session.user.user_metadata?.full_name
        ?? session.user.user_metadata?.name
        ?? ""
      ) as string;
      const email = session.user.email ?? "";
      if (!fullName || !email) return;
      setGoogleLoading(false);
      setPendingOAuth({ name: fullName, email });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Drain pending OAuth whenever auth screen is ready or session arrives ───
  useEffect(() => {
    if (screen === "auth" && pendingOAuth && !applicationId) {
      const { name, email } = pendingOAuth;
      setPendingOAuth(null);
      handleStartWithCredentials(name, email);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, pendingOAuth]);

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

  // ── Google OAuth ───────────────────────────────────────────────────────────
  const handleGoogleAuth = useCallback(async () => {
    setGoogleLoading(true);
    setAuthGlobalError("");
    // Flag this session as a user-initiated OAuth so the SIGNED_IN handler
    // knows the callback is intentional (not an automatic token refresh).
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(OAUTH_FLAG, "1");
    }
    try {
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.href },
      });
    } catch {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem(OAUTH_FLAG);
      }
      setAuthGlobalError("Google sign-in is not configured yet. Please use the email form.");
      setGoogleLoading(false);
    }
  }, []);

  // ── Start application with name + email ───────────────────────────────────
  const handleStartWithCredentials = useCallback(async (name: string, email: string) => {
    if (!jobInfo) return;
    if (isStartingRef.current) return;
    isStartingRef.current = true;
    setIsAuthLoading(true);
    setAuthGlobalError("");

    // ── Warmup gate ──────────────────────────────────────────────────────────
    // Before sending any POST request we must confirm the backend is warm.
    // If it has gone cold (unlikely but possible if user took >15 min), poll
    // GET /health until we get a proper CORS response, then proceed.
    // wakeBackend() fires a no-cors request first — guaranteed to reach the
    // Render dyno and trigger its wake cycle even if CORS headers are missing.
    if (!backendWarmRef.current) {
      wakeBackend();
      setAuthGlobalError("Connecting to server, please wait…");
      await waitForBackendWarm(55_000);
      setAuthGlobalError("");
      backendWarmRef.current = true;
    }

    // Attempt startInterview — retries once after 20 s if the backend is cold.
    const tryStart = async (attempt = 1) => {
      try {
        return await interviewAPI.startInterview(token, name, email);
      } catch (err: unknown) {
        const msg = (err instanceof Error ? err.message : "").toLowerCase();
        const isNetwork = msg.includes("failed to fetch") || msg.includes("network") || msg.includes("fetch");
        if (isNetwork && attempt === 1) {
          // Unexpected network failure — wait for confirmed warm then retry.
          wakeBackend();
          setAuthGlobalError("Server is warming up, please wait a moment…");
          await waitForBackendWarm(55_000);
          setAuthGlobalError("");
          backendWarmRef.current = true;
          return tryStart(2);
        }
        throw err;
      }
    };

    try {
      const r = await tryStart();
      setCandidateName(name);
      setCandidateEmail(email);
      setApplicationId(r.interview_id);

      if (r.resumed && r.transcript?.length) {
        // Hydrate existing transcript — no kickoff needed, transcript already has messages.
        // Calling kickoff here would add the last AI message a second time → duplicate.
        const hydrated: ConversationMessage[] = (r.transcript as unknown[]).map((raw) => {
          const entry = raw as Record<string, unknown>;
          return {
            id:                nanoid(),
            role:              entry.role as "ai" | "candidate",
            content:           (entry.content as string) ?? "",
            timestamp:         (entry.timestamp as string) ?? new Date().toISOString(),
            action:            entry.action as ConversationMessage["action"],
            requirement_id:    (entry.requirement_id as string | null) ?? null,
            requirement_label: (entry.requirement_label as string | null) ?? null,
            cardStatus:        (entry.action === "request_file" || entry.action === "request_link")
              ? ("complete" as const)
              : undefined,
          };
        });
        setMessages(hydrated);
        setScreen("conversation");
      } else {
        // Fresh start — kick off to get the opening greeting from the backend.
        setScreen("conversation");
        await kickoffConversation(r.interview_id, false, []);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      if (msg.toLowerCase().includes("already submitted")) {
        setAuthGlobalError("You have already submitted your application for this role.");
      } else {
        setAuthGlobalError(msg);
      }
      isStartingRef.current = false;
    } finally {
      setIsAuthLoading(false);
    }
  }, [jobInfo, token]);

  // ── Kick off conversation (first AI message) ───────────────────────────────
  const kickoffConversation = useCallback(async (appId: string, resumed: boolean, existingConv: unknown[]) => {
    // Guard: React concurrent mode can invoke this twice. Only the first call proceeds.
    if (kickoffCalledRef.current) return;
    kickoffCalledRef.current = true;

    const thinkingId = nanoid();
    setMessages((prev) => {
      const base = resumed && existingConv.length ? prev : [];
      return [...base, {
        id: thinkingId, role: "ai", content: "", timestamp: new Date().toISOString(), isTyping: true,
      }];
    });

    const attemptSend = async () => {
      const resp = await interviewAPI.sendMessage(appId, "");
      setMessages((prev) => prev.filter((m) => m.id !== thinkingId).concat([{
        id:                nanoid(),
        role:              "ai",
        content:           resp.message,
        timestamp:         new Date().toISOString(),
        action:            resp.action,
        requirement_id:    resp.requirement_id,
        requirement_label: resp.requirement_label,
        cardStatus:        (resp.action === "request_file" || resp.action === "request_link") ? "idle" : undefined,
      }]));
    };

    try {
      await attemptSend();
    } catch {
      // First attempt failed — backend may still be stabilising after a cold-start.
      // Poll /health until it responds with CORS headers (up to 55 s), then retry.
      try {
        setAiError("Server is warming up — this takes a few seconds. Retrying…");
        wakeBackend(); // fire no-cors wake signal to accelerate dyno start
        await waitForBackendWarm(55_000);
        backendWarmRef.current = true;
        setAiError("");
        await attemptSend();
      } catch {
        setMessages((prev) => prev.filter((m) => m.id !== thinkingId));
        kickoffCalledRef.current = false;
        setAiError("Could not connect to the AI. Please refresh the page to try again.");
      }
    }
  }, []);

  // ── Shared: post auto candidate message + get next AI reply ───────────────
  const sendAutoMessage = useCallback(async (text: string) => {
    setIsWaitingForAI(true);
    const thinkingId = nanoid();
    setMessages((prev) => [
      ...prev,
      { id: nanoid(), role: "candidate", content: text, timestamp: new Date().toISOString() },
      { id: thinkingId, role: "ai", content: "", timestamp: new Date().toISOString(), isTyping: true },
    ]);
    try {
      const resp = await interviewAPI.sendMessage(applicationId, text);
      setMessages((prev) => prev.filter((m) => m.id !== thinkingId).concat([{
        id:                nanoid(),
        role:              "ai",
        content:           resp.message,
        timestamp:         new Date().toISOString(),
        action:            resp.action,
        requirement_id:    resp.requirement_id,
        requirement_label: resp.requirement_label,
        cardStatus:        (resp.action === "request_file" || resp.action === "request_link") ? "idle" : undefined,
      }]));
      if (resp.action === "complete") {
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

    try {
      const resp = await interviewAPI.sendMessage(applicationId, text);
      setMessages((prev) => prev.filter((m) => m.id !== thinkingId).concat([{
        id:                nanoid(),
        role:              "ai",
        content:           resp.message,
        timestamp:         new Date().toISOString(),
        action:            resp.action,
        requirement_id:    resp.requirement_id,
        requirement_label: resp.requirement_label,
        cardStatus:        (resp.action === "request_file" || resp.action === "request_link") ? "idle" : undefined,
      }]));
      if (resp.action === "complete") {
        setProgressPct(100);
        setApplicationComplete(true);
        setTimeout(() => setScreen("review"), 1800);
      }
    } catch (err: unknown) {
      setMessages((prev) => prev.filter((m) => m.id !== thinkingId));
      setAiError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsWaitingForAI(false);
      setTimeout(() => inputRef.current?.focus(), 50);
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
      await interviewAPI.confirmSubmission(applicationId);
      setScreen("complete");
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Submission failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }, [applicationId]);

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
        onStart={() => {
          // Fire a no-cors wake signal the moment the user enters the auth screen.
          // If somehow the backend has gone cold since the welcome screen loaded,
          // this starts the wake cycle while the user fills the form.
          wakeBackend();
          setScreen("auth");
        }}
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

  if (screen === "auth") {
    return (
      <AuthScreen
        jobInfo={jobInfo!}
        onAuth={handleStartWithCredentials}
        onGoogleAuth={handleGoogleAuth}
        isLoading={isAuthLoading}
        googleLoading={googleLoading}
        globalError={authGlobalError}
      />
    );
  }

  // ── Review screen ──────────────────────────────────────────────────────────
  if (screen === "review") {
    const rawDetails  = extractPersonalDetails(messages, candidateName, candidateEmail);
    const personalDetails = rawDetails.map((d) => ({
      label: d.label,
      value: detailEdits[d.label] !== undefined ? detailEdits[d.label] : d.value,
    }));

    const submittedDocs = messages.filter(
      (m) => m.role === "ai" && m.cardStatus === "complete",
    );
    const keyAnswers = messages.filter((m, i) => {
      if (m.role !== "candidate") return false;
      if (m.content.split(" ").length < 10) return false;
      const prevAi = messages.slice(0, i).filter((x) => x.role === "ai").at(-1);
      if (prevAi && PERSONAL_RE.test(prevAi.content ?? "")) return false;
      return true;
    }).slice(0, 3);

    return (
      <div className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-start px-4 py-12" dir="ltr">
        <div className="max-w-[520px] w-full space-y-5">
          {/* Header */}
          <div className="text-center space-y-2">
            <Mark className="w-7 h-7 text-ink mx-auto" />
            <h1 className="text-[26px] font-bold text-ink leading-tight"
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
              Review your application
            </h1>
            <p className="text-[13px] text-sub">
              Check everything before it goes to{" "}
              <strong>{jobInfo?.company_name}</strong>. You can edit any field below.
            </p>
          </div>

          {/* Personal details */}
          {personalDetails.length > 0 && (
            <div className="bg-white border border-border rounded-[4px] overflow-hidden">
              <div className="px-5 py-3 border-b border-border bg-[var(--bg)]">
                <h2 className="text-[11px] font-semibold text-sub uppercase tracking-wider">Your Details</h2>
              </div>
              <div className="divide-y divide-border">
                {personalDetails.map(({ label, value }) => (
                  <div key={label} className="px-5 py-3 flex items-center justify-between gap-4">
                    <span className="text-[12px] text-muted shrink-0 w-24">{label}</span>
                    <input
                      type="text"
                      value={value}
                      dir="ltr"
                      onChange={(e) => setDetailEdits((prev) => ({ ...prev, [label]: e.target.value }))}
                      className="flex-1 text-[13px] text-ink bg-transparent border-b border-transparent focus:border-border outline-none transition-colors text-right py-0.5 placeholder:text-muted"
                    />
                  </div>
                ))}
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

          {/* Key answers preview */}
          {keyAnswers.length > 0 && (
            <div className="bg-white border border-border rounded-[4px] overflow-hidden">
              <div className="px-5 py-3 border-b border-border bg-[var(--bg)]">
                <h2 className="text-[11px] font-semibold text-sub uppercase tracking-wider">Your Answers</h2>
              </div>
              <div className="divide-y divide-border">
                {keyAnswers.map((m, idx) => (
                  <div key={m.id} className="px-5 py-3">
                    <p className="text-[11px] text-muted mb-1">Answer {idx + 1}</p>
                    <p className="text-[13px] text-ink leading-relaxed line-clamp-3">{m.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Submit error */}
          {submitError && (
            <div className="flex items-start gap-2 rounded-[4px] bg-red-50 border border-danger/20 px-3 py-2.5 text-[13px] text-danger">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {submitError}
            </div>
          )}

          {/* Actions */}
          <div className="space-y-3 pt-1">
            <button
              onClick={handleConfirmSubmit}
              disabled={isSubmitting}
              className="w-full bg-[#1A1714] text-white rounded-[4px] px-4 py-3.5 text-[14px] font-semibold hover:bg-[#2d2926] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <><Spinner className="w-4 h-4" /> Submitting…</>
              ) : (
                <>Submit Application <ChevronRight className="w-4 h-4" /></>
              )}
            </button>
            <button
              onClick={() => setScreen("conversation")}
              className="w-full bg-transparent border border-border rounded-[4px] px-4 py-3 text-[13px] text-sub hover:text-ink hover:border-ink transition-colors"
            >
              ← Review your answers
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
    const firstName = candidateName.trim().split(" ")[0] || candidateName;
    return (
      <div className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-4" dir="ltr">
        <div className="max-w-sm w-full text-center space-y-4">
          <svg className="w-12 h-12 mx-auto text-ink" viewBox="0 0 48 48" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="24" cy="24" r="22" />
            <polyline points="14 24 21 31 34 17" />
          </svg>
          <h1 className="text-[28px] font-bold text-ink"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
            You&apos;re all set{firstName ? `, ${firstName}` : ""}.
          </h1>
          <p className="text-[13px] text-sub leading-relaxed">
            Your application has been submitted to{" "}
            <strong>{jobInfo?.company_name}</strong>. They&apos;ll be in touch if you&apos;re
            selected to move forward.
          </p>
          <p className="text-[11px] text-muted pt-6">Secured by HireIQ</p>
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
