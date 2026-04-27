"use client";

/**
 * HireIQ Candidate Interview — Conversational experience
 *
 * Screens: loading → auth → conversation → review → complete | error
 *
 * The AI drives the entire conversation — no static Q&A, no "Next Question" button.
 * File/link uploads live in the bottom input bar (not buried in message bubbles).
 * Auth via Google OAuth or email + name form.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { Paperclip, Link2, Send, AlertCircle, CheckCircle2 } from "lucide-react";
import { interviewAPI } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { JobPublicInfo } from "@/lib/types";

// ── Types ──────────────────────────────────────────────────────────────────────

type Screen = "loading" | "auth" | "conversation" | "review" | "complete" | "error";

interface ConversationMessage {
  id: string;
  role: "ai" | "candidate";
  content: string;
  timestamp: string;
  isTyping?: boolean;
  action?: "continue" | "request_file" | "request_link" | "complete";
  requirement_id?: string | null;
  requirement_label?: string | null;
  /** Completion state for the inline badge — set after bar-level upload/link */
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

// ── Mark (HireIQ logo) ─────────────────────────────────────────────────────────

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
    <div className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-4 py-12">
      <div className="max-w-[400px] w-full space-y-6">
        {/* Header */}
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
          {/* Global error */}
          {globalError && (
            <div className="flex items-start gap-2 rounded-[4px] bg-red-50 border border-danger/20 px-3 py-2.5 text-[13px] text-danger">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {globalError}
            </div>
          )}

          {/* Google OAuth */}
          <button
            onClick={onGoogleAuth}
            disabled={googleLoading || isLoading}
            className="w-full flex items-center justify-center gap-3 bg-[#1A1714] text-white rounded-[4px] px-4 py-3 text-[14px] font-medium hover:bg-[#2d2926] transition-colors disabled:opacity-50"
          >
            {googleLoading ? <Spinner /> : <GoogleIcon />}
            Continue with Google
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[12px] text-muted">or enter your details</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Manual form */}
          <div className="space-y-3">
            <div>
              <label className="block text-[12px] font-medium text-ink mb-1">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                autoComplete="name"
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
            {isLoading ? <><Spinner /> Setting up your interview…</> : "Continue →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── AI Message Bubble ──────────────────────────────────────────────────────────
// Displays text only. File/link interaction is in the bottom bar.
// Shows a completion badge after the user submits the requested item.

function AIMessageBubble({ message }: { message: ConversationMessage }) {
  return (
    <div className="flex items-start gap-3">
      {/* Avatar */}
      <div className="w-6 h-6 rounded-full bg-white border border-border flex items-center justify-center shrink-0 mt-1">
        {message.isTyping ? (
          <span className="w-1.5 h-4 bg-muted rounded-full animate-pulse inline-block" />
        ) : (
          <Mark className="w-3 h-3 text-muted" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {message.isTyping ? (
          <span className="text-[16px] text-muted animate-pulse"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>_</span>
        ) : (
          <p className="text-[16px] text-ink leading-[1.75]"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
            {message.content}
          </p>
        )}

        {/* File completion badge */}
        {message.cardStatus === "complete" && message.action === "request_file" && (
          <div className="mt-3 flex items-center gap-2.5 bg-green-50 border border-success/20 rounded-[4px] px-4 py-2.5">
            <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
            <span className="text-[13px] text-ink truncate flex-1">{message.cardFileName}</span>
            {message.cardFileSize != null && (
              <span className="text-[11px] text-muted shrink-0">{formatSize(message.cardFileSize)}</span>
            )}
          </div>
        )}

        {/* Link completion badge */}
        {message.cardStatus === "complete" && message.action === "request_link" && (
          <div className="mt-3 flex items-center gap-2.5 bg-green-50 border border-success/20 rounded-[4px] px-4 py-2.5">
            <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
            <a href={message.cardUrl} target="_blank" rel="noopener noreferrer"
              className="text-[13px] text-ink underline underline-offset-2 truncate flex-1 hover:text-muted transition-colors">
              {message.cardUrl}
            </a>
          </div>
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
    <div className="flex flex-col items-end gap-1">
      {showTimestamp && (
        <p className="text-[11px]" style={{ color: "#9C9590" }}>{time}</p>
      )}
      <p className="text-[15px] text-ink border-r-2 border-[#E8E4DF] pr-3.5 max-w-[85%] text-right leading-relaxed">
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

export default function InterviewPage() {
  const { token } = useParams<{ token: string }>();
  const [screen, setScreen]     = useState<Screen>("loading");
  const [jobInfo, setJobInfo]   = useState<JobPublicInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Auth state
  const [isAuthLoading, setIsAuthLoading]     = useState(false);
  const [googleLoading, setGoogleLoading]     = useState(false);
  const [authGlobalError, setAuthGlobalError] = useState("");
  const [candidateName, setCandidateName]     = useState("");
  const [candidateEmail, setCandidateEmail]   = useState("");

  // Interview session
  const [interviewId, setInterviewId]       = useState("");
  const [messages, setMessages]             = useState<ConversationMessage[]>([]);
  const [inputValue, setInputValue]         = useState("");
  const [isWaitingForAI, setIsWaitingForAI] = useState(false);
  const [aiError, setAiError]               = useState("");
  const [progressPct, setProgressPct]       = useState(0);

  // Bar-level upload / link state
  const [linkValue, setLinkValue]         = useState("");
  const [barError, setBarError]           = useState("");
  const [isUploading, setIsUploading]     = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadFileName, setUploadFileName] = useState("");
  const pageFileRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLTextAreaElement>(null);
  const lastShownTime  = useRef<number>(0);
  const isStartingRef  = useRef(false);
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

  // ── Load job info ──────────────────────────────────────────────────────────
  useEffect(() => {
    interviewAPI.getJobInfo(token)
      .then((info) => {
        setJobInfo(info);
        setScreen("welcome" as Screen);
      })
      .catch((err: Error) => {
        const m = err.message.toLowerCase();
        setErrorMsg(
          m.includes("expired") || m.includes("longer active")
            ? "This interview link has expired. Please contact the company for a new link."
            : m.includes("not found")
            ? "This interview link is not valid. Please check the link and try again."
            : "Something went wrong loading the interview. Please refresh.",
        );
        setScreen("error");
      });
  }, [token]);

  useEffect(() => {
    if ((screen as string) === "welcome" && jobInfo) setScreen("auth");
  }, [screen, jobInfo]);

  // ── Supabase OAuth state change ───────────────────────────────────────────
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session && !interviewId) {
          const fullName = (
            session.user.user_metadata?.full_name
            ?? session.user.user_metadata?.name
            ?? ""
          ) as string;
          const email = session.user.email ?? "";
          if (!fullName || !email) return;
          setGoogleLoading(false);
          setPendingOAuth({ name: fullName, email });
        }
      }
    );
    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Drain pending OAuth whenever auth screen is ready OR session arrives ───
  useEffect(() => {
    if (screen === "auth" && pendingOAuth && !interviewId) {
      const { name, email } = pendingOAuth;
      setPendingOAuth(null);
      handleStartWithCredentials(name, email);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, pendingOAuth]);

  // ── Scroll to bottom on new messages ──────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

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
  }, [pendingAction]);

  // ── Google OAuth ───────────────────────────────────────────────────────────
  const handleGoogleAuth = useCallback(async () => {
    setGoogleLoading(true);
    setAuthGlobalError("");
    try {
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.href },
      });
    } catch {
      setAuthGlobalError("Google sign-in is not configured yet. Please use the email form.");
      setGoogleLoading(false);
    }
  }, []);

  // ── Start interview with name + email ─────────────────────────────────────
  const handleStartWithCredentials = useCallback(async (name: string, email: string) => {
    if (!jobInfo) return;
    if (isStartingRef.current) return;
    isStartingRef.current = true;
    setIsAuthLoading(true);
    setAuthGlobalError("");
    try {
      const r = await interviewAPI.startInterview(token, name, email);
      setCandidateName(name);
      setCandidateEmail(email);
      setInterviewId(r.interview_id);

      if (r.resumed && r.transcript?.length) {
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
      }

      setScreen("conversation");
      await kickoffConversation(r.interview_id, r.resumed, r.transcript ?? []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      if (msg.includes("already submitted")) {
        setAuthGlobalError("You've already submitted your application for this role.");
      } else {
        setAuthGlobalError(msg);
      }
      isStartingRef.current = false;
    } finally {
      setIsAuthLoading(false);
    }
  }, [jobInfo, token]);

  // ── Kick off conversation (first AI message) ───────────────────────────────
  const kickoffConversation = useCallback(async (ivId: string, resumed: boolean, existingConv: unknown[]) => {
    const thinkingId = nanoid();
    setMessages((prev) => {
      const base = resumed && existingConv.length ? prev : [];
      return [...base, {
        id: thinkingId, role: "ai", content: "", timestamp: new Date().toISOString(), isTyping: true,
      }];
    });

    try {
      const resp = await interviewAPI.sendMessage(ivId, "");
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
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== thinkingId));
      setAiError("Couldn't start the interview. Please refresh.");
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
      const resp = await interviewAPI.sendMessage(interviewId, text);
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
        setTimeout(() => setScreen("review"), 3500);
      }
    } catch {
      setAiError("Couldn't continue the interview. Please try again.");
    } finally {
      setIsWaitingForAI(false);
    }
  }, [interviewId]);

  // ── Send candidate message ─────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || isWaitingForAI || hasCardPending) return;

    setInputValue("");
    setAiError("");
    setIsWaitingForAI(true);

    const now   = new Date().toISOString();
    const nowMs = Date.now();
    const showTs = (nowMs - lastShownTime.current) > 60_000;
    if (showTs) lastShownTime.current = nowMs;

    const thinkingId = nanoid();
    setMessages((prev) => [
      ...prev,
      { id: nanoid(), role: "candidate", content: text, timestamp: now },
      { id: thinkingId, role: "ai", content: "", timestamp: now, isTyping: true },
    ]);

    try {
      const resp = await interviewAPI.sendMessage(interviewId, text);
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
        setTimeout(() => setScreen("review"), 3500);
      }
    } catch (err: unknown) {
      setMessages((prev) => prev.filter((m) => m.id !== thinkingId));
      setAiError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsWaitingForAI(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [inputValue, isWaitingForAI, hasCardPending, interviewId]);

  // ── Bar-level file upload ──────────────────────────────────────────────────
  const handlePageFile = useCallback(async (file: File) => {
    if (!lastAiMsg) return;
    const MAX = 10 * 1024 * 1024;
    if (file.size > MAX) { setBarError("File exceeds 10 MB. Please choose a smaller file."); return; }
    const ALLOWED = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/jpeg", "image/png", "text/plain",
    ];
    if (!ALLOWED.includes(file.type) && !file.name.match(/\.(pdf|docx?|jpg|jpeg|png|txt)$/i)) {
      setBarError("Invalid type. Use PDF, Word, JPEG, or PNG.");
      return;
    }

    setBarError("");
    setIsUploading(true);
    setUploadFileName(file.name);
    setUploadProgress(0);

    const msgId    = lastAiMsg.id;
    const reqId    = lastAiMsg.requirement_id ?? "";
    const reqLabel = lastAiMsg.requirement_label ?? "file";

    try {
      await interviewAPI.uploadFile(
        interviewId, reqId, reqLabel, reqId, file,
        (pct) => setUploadProgress(pct),
      );
      setIsUploading(false);
      setMessages((prev) => prev.map((m) =>
        m.id === msgId
          ? { ...m, cardStatus: "complete", cardFileName: file.name, cardFileSize: file.size }
          : m,
      ));
      await sendAutoMessage(`I've uploaded my ${reqLabel}.`);
    } catch (e) {
      setIsUploading(false);
      setBarError(e instanceof Error ? e.message : "Upload failed. Please try again.");
    }
  }, [lastAiMsg, interviewId, sendAutoMessage]);

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
      await interviewAPI.submitLink(interviewId, reqId, reqLabel, cleaned);
      setMessages((prev) => prev.map((m) =>
        m.id === msgId ? { ...m, cardStatus: "complete", cardUrl: cleaned } : m,
      ));
      setLinkValue("");
      await sendAutoMessage(`Here's my ${reqLabel}: ${cleaned}`);
    } catch (e) {
      setBarError(e instanceof Error ? e.message : "Submission failed. Please try again.");
    }
  }, [lastAiMsg, linkValue, interviewId, sendAutoMessage]);

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

  // ── Screens ────────────────────────────────────────────────────────────────

  if (screen === "loading") {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center gap-4">
        <Mark className="w-7 h-7 text-muted" />
        <p className="text-[13px] text-muted">Loading…</p>
      </div>
    );
  }

  if (screen === "error") {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-4">
        <Mark className="w-6 h-6 text-muted mb-6" />
        <div className="bg-white border border-border rounded-[4px] p-8 max-w-sm w-full text-center">
          <p className="text-[13px] text-sub leading-relaxed">{errorMsg}</p>
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
    const personalDetails = extractPersonalDetails(messages, candidateName, candidateEmail);
    const submittedDocs   = messages.filter(
      (m) => m.role === "ai" && m.cardStatus === "complete",
    );
    const keyAnswers = messages.filter((m, i) => {
      if (m.role !== "candidate") return false;
      if ((m.content.split(" ").length) < 10) return false;
      const prevAi = messages.slice(0, i).filter((x) => x.role === "ai").at(-1);
      if (prevAi && PERSONAL_RE.test(prevAi.content ?? "")) return false;
      return true;
    }).slice(0, 3);

    return (
      <div className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-start px-4 py-12">
        <div className="max-w-[520px] w-full space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <Mark className="w-7 h-7 text-ink mx-auto" />
            <h1 className="text-[26px] font-bold text-ink leading-tight"
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
              Review your application
            </h1>
            <p className="text-[13px] text-sub">
              Take a moment to confirm everything before we send it to{" "}
              <strong>{jobInfo?.company_name}</strong>.
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
                  <div key={label} className="px-5 py-3 flex items-baseline justify-between gap-4">
                    <span className="text-[12px] text-muted shrink-0">{label}</span>
                    <span className="text-[13px] text-ink text-right">{value}</span>
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
                  <div key={m.id} className="px-5 py-3 flex items-center gap-3">
                    <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                    <span className="text-[13px] text-ink truncate flex-1">
                      {m.cardFileName ?? m.cardUrl}
                    </span>
                    {m.cardFileSize != null && (
                      <span className="text-[11px] text-muted shrink-0">{formatSize(m.cardFileSize)}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Key answers */}
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

          {/* Actions */}
          <div className="space-y-3 pt-2">
            <button
              onClick={() => setScreen("complete")}
              className="w-full bg-[#1A1714] text-white rounded-[4px] px-4 py-3.5 text-[14px] font-semibold hover:bg-[#2d2926] transition-colors"
            >
              Submit Application →
            </button>
            <button
              onClick={() => setScreen("conversation")}
              className="w-full bg-transparent border border-border rounded-[4px] px-4 py-3 text-[13px] text-sub hover:text-ink hover:border-ink transition-colors"
            >
              ← Go back and continue
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
      <div className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-4">
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
  const canSend = inputValue.trim().length > 0 && !isWaitingForAI && !hasCardPending;

  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col">
      <TopBar
        company={jobInfo?.company_name ?? ""}
        title={jobInfo?.title ?? ""}
        progress={progressPct}
      />

      {/* Hidden page-level file input */}
      <input
        ref={pageFileRef}
        type="file"
        accept=".pdf,.docx,.doc,.jpg,.jpeg,.png,.txt"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handlePageFile(f);
          e.target.value = "";
        }}
      />

      {/* Message list */}
      <div className="flex-1 overflow-y-auto">
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
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Fixed bottom input bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-[var(--bg)] border-t border-border">
        <div className="max-w-[680px] mx-auto px-4 py-3">
          {/* Error line (AI or bar) */}
          {(aiError || barError) && (
            <p className="text-[12px] text-danger mb-2 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {aiError || barError}
            </p>
          )}

          {/* FILE ATTACH BAR */}
          {pendingAction === "request_file" && (
            isUploading ? (
              /* Progress bar during upload */
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
              /* Clickable attach zone */
              <button
                type="button"
                onClick={() => { setBarError(""); pageFileRef.current?.click(); }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) { setBarError(""); handlePageFile(f); }
                }}
                className="w-full flex items-center gap-3 border-2 border-dashed border-border rounded-[4px] px-4 py-3 hover:border-ink transition-colors group cursor-pointer"
              >
                <Paperclip className="w-4 h-4 text-muted group-hover:text-ink transition-colors shrink-0" />
                <span className="text-[13px] text-sub group-hover:text-ink transition-colors text-left">
                  Attach {lastAiMsg?.requirement_label ?? "document"}
                  <span className="ml-2 text-[11px] text-muted font-normal">
                    PDF, Word, JPEG, PNG · max 10 MB
                  </span>
                </span>
              </button>
            )
          )}

          {/* LINK INPUT BAR */}
          {pendingAction === "request_link" && (
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
                  className="flex-1 bg-white border border-border rounded-[4px] px-3 py-2.5 text-[14px] text-ink outline-none resize-none overflow-hidden placeholder:text-muted transition-colors focus:border-ink disabled:opacity-50"
                  style={{ minHeight: "42px", maxHeight: "160px" }}
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
          )}
        </div>
      </div>
    </div>
  );
}
