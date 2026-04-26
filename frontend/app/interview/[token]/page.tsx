"use client";

/**
 * HireIQ Candidate Interview — Conversational experience
 *
 * Screens: loading → auth → conversation → complete | error
 *
 * The AI drives the entire conversation — no static Q&A, no "Next Question" button.
 * Inline file/link cards appear when the AI requests documents.
 * Auth via Google OAuth (env vars required) or email + name form.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, FileText, Link2, Upload, Send, X, AlertCircle } from "lucide-react";
import { interviewAPI } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { JobPublicInfo } from "@/lib/types";

// ── Types ──────────────────────────────────────────────────────────────────────

type Screen = "loading" | "auth" | "conversation" | "complete" | "error";

interface ConversationMessage {
  id: string;
  role: "ai" | "candidate";
  content: string;
  timestamp: string;
  isTyping?: boolean;
  action?: "continue" | "request_file" | "request_link" | "complete";
  requirement_id?: string | null;
  requirement_label?: string | null;
  /** Card state — lives only on the AI message that requested the item */
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

// ── File Upload Card (inline in AI message) ────────────────────────────────────

interface FileUploadCardProps {
  message: ConversationMessage;
  interviewId: string;
  requirementId: string;
  requirementLabel: string;
  onComplete: (msgId: string, fileName: string, fileSize: number) => void;
  onProgress: (msgId: string, pct: number, fileName?: string) => void;
  onError: (msgId: string, error: string) => void;
}

function FileUploadCard({ message, interviewId, requirementId, requirementLabel, onComplete, onProgress, onError }: FileUploadCardProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    const MAX = 10 * 1024 * 1024;
    if (file.size > MAX) { onError(message.id, "File exceeds 10 MB. Please choose a smaller file."); return; }

    const ALLOWED = ["application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/jpeg", "image/png", "text/plain"];
    if (!ALLOWED.includes(file.type) && !file.name.match(/\.(pdf|docx?|jpg|jpeg|png|txt)$/i)) {
      onError(message.id, "Invalid file type. Use PDF, Word, JPEG, or PNG.");
      return;
    }

    onProgress(message.id, 0, file.name);
    try {
      await interviewAPI.uploadFile(
        interviewId, requirementId, requirementLabel, requirementId, file,
        (pct) => onProgress(message.id, pct, file.name),
      );
      onComplete(message.id, file.name, file.size);
    } catch (e) {
      onError(message.id, e instanceof Error ? e.message : "Upload failed.");
    }
  };

  if (message.cardStatus === "complete") {
    return (
      <div className="mt-3 flex items-center gap-2.5 bg-green-50 border border-success/20 rounded-[4px] px-4 py-2.5">
        <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
        <span className="text-[13px] text-ink truncate flex-1">{message.cardFileName}</span>
        {message.cardFileSize && (
          <span className="text-[11px] text-muted shrink-0">{formatSize(message.cardFileSize)}</span>
        )}
      </div>
    );
  }

  if (message.cardStatus === "uploading") {
    return (
      <div className="mt-3 space-y-1.5 px-1">
        <div className="flex justify-between text-[12px] text-sub">
          <span className="truncate">{message.cardFileName ?? "Uploading…"}</span>
          <span>{message.cardProgress ?? 0}%</span>
        </div>
        <div className="h-1.5 bg-border rounded-full overflow-hidden">
          <div className="h-full bg-ink rounded-full transition-all duration-150"
            style={{ width: `${message.cardProgress ?? 0}%` }} />
        </div>
      </div>
    );
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.docx,.doc,.jpg,.jpeg,.png,.txt"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
        className="mt-3 w-full border-2 border-dashed border-border rounded-[4px] px-4 py-4 text-center hover:border-ink transition-colors cursor-pointer group"
      >
        <Upload className="w-5 h-5 text-muted mx-auto mb-1.5 group-hover:text-ink transition-colors" />
        <p className="text-[13px] text-sub group-hover:text-ink transition-colors">
          Drop file here or <span className="underline underline-offset-2">browse</span>
        </p>
        <p className="text-[11px] text-muted mt-0.5">PDF, Word, JPEG, PNG · max 10 MB</p>
        {message.cardStatus === "error" && (
          <p className="text-[12px] text-danger mt-1.5 flex items-center justify-center gap-1">
            <X className="w-3 h-3" />{message.cardError}
          </p>
        )}
      </button>
    </>
  );
}

// ── Link Input Card (inline in AI message) ─────────────────────────────────────

interface LinkInputCardProps {
  message: ConversationMessage;
  interviewId: string;
  requirementId: string;
  requirementLabel: string;
  onComplete: (msgId: string, url: string) => void;
  onError: (msgId: string, error: string) => void;
}

function LinkInputCard({ message, interviewId, requirementId, requirementLabel, onComplete, onError }: LinkInputCardProps) {
  const [url, setUrl] = useState(message.cardUrl ?? "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    const cleaned = url.trim();
    if (!cleaned.startsWith("http://") && !cleaned.startsWith("https://")) {
      onError(message.id, "URL must start with http:// or https://");
      return;
    }
    setSaving(true);
    try {
      await interviewAPI.submitLink(interviewId, requirementId, requirementLabel, cleaned);
      onComplete(message.id, cleaned);
    } catch (e) {
      onError(message.id, e instanceof Error ? e.message : "Submission failed.");
    } finally { setSaving(false); }
  };

  if (message.cardStatus === "complete") {
    return (
      <div className="mt-3 flex items-center gap-2.5 bg-green-50 border border-success/20 rounded-[4px] px-4 py-2.5">
        <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
        <a href={message.cardUrl} target="_blank" rel="noopener noreferrer"
          className="text-[13px] text-ink underline underline-offset-2 truncate flex-1 hover:text-muted transition-colors">
          {message.cardUrl}
        </a>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
          placeholder="https://"
          className={`flex-1 bg-white border rounded-[4px] px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-ink placeholder:text-muted ${message.cardStatus === "error" ? "border-danger" : "border-border"}`}
        />
        <button
          onClick={handleSubmit}
          disabled={saving || !url.trim()}
          className="px-3 py-2 bg-[#1A1714] text-white text-[13px] font-medium rounded-[4px] hover:bg-[#2d2926] transition-colors disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap"
        >
          {saving ? <Spinner className="w-3.5 h-3.5" /> : null}
          Add
        </button>
      </div>
      {message.cardStatus === "error" && (
        <p className="text-[12px] text-danger">{message.cardError}</p>
      )}
    </div>
  );
}

// ── AI Message ─────────────────────────────────────────────────────────────────

interface AIMessageProps {
  message: ConversationMessage;
  interviewId: string;
  onFileComplete: (msgId: string, fileName: string, fileSize: number) => void;
  onFileProgress: (msgId: string, pct: number, fileName?: string) => void;
  onFileError: (msgId: string, error: string) => void;
  onLinkComplete: (msgId: string, url: string) => void;
  onLinkError: (msgId: string, error: string) => void;
}

function AIMessageBubble({ message, interviewId, onFileComplete, onFileProgress, onFileError, onLinkComplete, onLinkError }: AIMessageProps) {
  const showCard = message.action === "request_file" || message.action === "request_link";
  const cardDone = message.cardStatus === "complete";

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
          <span className="text-[16px] text-muted animate-pulse" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>_</span>
        ) : (
          <p className="text-[16px] text-ink leading-[1.75]"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
            {message.content}
          </p>
        )}

        {/* Inline file card — FileUploadCard handles idle / uploading / error / complete */}
        {showCard && !message.isTyping && message.action === "request_file" && (
          <FileUploadCard
            message={message}
            interviewId={interviewId}
            requirementId={message.requirement_id ?? ""}
            requirementLabel={message.requirement_label ?? "file"}
            onComplete={onFileComplete}
            onProgress={onFileProgress}
            onError={onFileError}
          />
        )}

        {/* Inline link card — LinkInputCard handles idle / saving / error / complete */}
        {showCard && !message.isTyping && message.action === "request_link" && (
          <LinkInputCard
            message={message}
            interviewId={interviewId}
            requirementId={message.requirement_id ?? ""}
            requirementLabel={message.requirement_label ?? "link"}
            onComplete={onLinkComplete}
            onError={onLinkError}
          />
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
        {/* Progress bar */}
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

  // Interview session
  const [interviewId, setInterviewId]           = useState("");
  const [messages, setMessages]                 = useState<ConversationMessage[]>([]);
  const [inputValue, setInputValue]             = useState("");
  const [isWaitingForAI, setIsWaitingForAI]     = useState(false);
  const [aiError, setAiError]                   = useState("");
  const [hasCardPending, setHasCardPending]     = useState(false);
  const [progressPct, setProgressPct]           = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLTextAreaElement>(null);
  const lastShownTime  = useRef<number>(0); // for timestamp display logic
  // Holds Google session that arrived before the auth screen was ready
  const pendingOAuthRef = useRef<{ name: string; email: string } | null>(null);

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

  // Show auth screen once job info loaded
  useEffect(() => {
    if ((screen as string) === "welcome" && jobInfo) setScreen("auth");
  }, [screen, jobInfo]);

  // ── Supabase OAuth state change ───────────────────────────────────────────
  // Run once. Supabase v2 PKCE flow fires SIGNED_IN during code-exchange on
  // page load — often before screen reaches "auth". We park the session in a
  // ref and process it as soon as the auth screen is ready.
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
          // If auth screen is already visible, start immediately
          if (screen === "auth") {
            handleStartWithCredentials(fullName, email);
          } else {
            // Park it — will be picked up when auth screen mounts
            pendingOAuthRef.current = { name: fullName, email };
          }
        }
      }
    );
    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Drain pending OAuth session when auth screen becomes ready ────────────
  useEffect(() => {
    if (screen === "auth" && pendingOAuthRef.current && !interviewId) {
      const { name, email } = pendingOAuthRef.current;
      pendingOAuthRef.current = null;
      handleStartWithCredentials(name, email);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  // ── Scroll to bottom on new messages ──────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // ── Track pending card ─────────────────────────────────────────────────────
  useEffect(() => {
    const pending = messages.some(
      (m) => m.role === "ai" &&
        (m.action === "request_file" || m.action === "request_link") &&
        m.cardStatus !== "complete",
    );
    setHasCardPending(pending);
  }, [messages]);

  // ── Progress ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const candidateMsgs = messages.filter((m) => m.role === "candidate").length;
    const total = jobInfo?.question_count ?? 10;
    setProgressPct(Math.min(88, Math.round((candidateMsgs / total) * 100)));
  }, [messages, jobInfo]);

  // ── Google OAuth ───────────────────────────────────────────────────────────
  const handleGoogleAuth = useCallback(async () => {
    setGoogleLoading(true);
    setAuthGlobalError("");
    try {
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.href },
      });
      // Redirect happens — onAuthStateChange picks up the session
    } catch {
      setAuthGlobalError("Google sign-in is not configured yet. Please use the email form.");
      setGoogleLoading(false);
    }
  }, []);

  // ── Start interview with name + email ─────────────────────────────────────
  const handleStartWithCredentials = useCallback(async (name: string, email: string) => {
    if (!jobInfo) return;
    setIsAuthLoading(true);
    setAuthGlobalError("");
    try {
      const r = await interviewAPI.startInterview(token, name, email);
      setCandidateName(name);
      setInterviewId(r.interview_id);

      // Load existing conversation if resuming
      if (r.resumed && r.transcript?.length) {
        // Re-hydrate messages from stored conversation (new conversation format)
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
            cardStatus:        (entry.action === "request_file" || entry.action === "request_link") ? "complete" as const : undefined,
          };
        });
        setMessages(hydrated);
      }

      setScreen("conversation");

      // Get first message (or resume message)
      await kickoffConversation(r.interview_id, r.resumed, r.transcript ?? []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      if (msg.includes("already submitted")) {
        setAuthGlobalError("You've already submitted your application for this role.");
      } else {
        setAuthGlobalError(msg);
      }
    } finally {
      setIsAuthLoading(false);
    }
  }, [jobInfo, token]);

  // ── Kick off conversation (first AI message) ───────────────────────────────
  const kickoffConversation = useCallback(async (ivId: string, resumed: boolean, existingConv: unknown[]) => {
    // If resuming with existing messages: the backend returns the last AI message on empty candidate_message
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
        id:               nanoid(),
        role:             "ai",
        content:          resp.message,
        timestamp:        new Date().toISOString(),
        action:           resp.action,
        requirement_id:   resp.requirement_id,
        requirement_label: resp.requirement_label,
        cardStatus:       (resp.action === "request_file" || resp.action === "request_link") ? "idle" : undefined,
      }]));
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== thinkingId));
      setAiError("Couldn't start the interview. Please refresh.");
    }
  }, []);

  // ── Send candidate message ─────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || isWaitingForAI || hasCardPending) return;

    setInputValue("");
    setAiError("");
    setIsWaitingForAI(true);

    const now = new Date().toISOString();
    const nowMs = Date.now();
    const showTs = (nowMs - lastShownTime.current) > 60_000;
    if (showTs) lastShownTime.current = nowMs;

    const candidateMsg: ConversationMessage = {
      id: nanoid(), role: "candidate", content: text, timestamp: now,
    };
    const thinkingId = nanoid();

    setMessages((prev) => [
      ...prev,
      candidateMsg,
      { id: thinkingId, role: "ai", content: "", timestamp: now, isTyping: true },
    ]);

    try {
      const resp = await interviewAPI.sendMessage(interviewId, text);

      setMessages((prev) => prev.filter((m) => m.id !== thinkingId).concat([{
        id:               nanoid(),
        role:             "ai",
        content:          resp.message,
        timestamp:        new Date().toISOString(),
        action:           resp.action,
        requirement_id:   resp.requirement_id,
        requirement_label: resp.requirement_label,
        cardStatus:       (resp.action === "request_file" || resp.action === "request_link") ? "idle" : undefined,
      }]));

      if (resp.action === "complete") {
        setProgressPct(100);
        // Transition to complete screen after the candidate reads the final message
        setTimeout(() => setScreen("complete"), 3500);
      }
    } catch (err: unknown) {
      setMessages((prev) => prev.filter((m) => m.id !== thinkingId));
      setAiError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsWaitingForAI(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [inputValue, isWaitingForAI, hasCardPending, interviewId]);

  // After file upload completes: send automated candidate message to continue conversation
  const handleFileComplete = useCallback(async (msgId: string, fileName: string, fileSize: number) => {
    setMessages((prev) => prev.map((m) =>
      m.id === msgId
        ? { ...m, cardStatus: "complete", cardFileName: fileName, cardFileSize: fileSize }
        : m,
    ));

    // Find requirement label for the automated message
    const msg = messages.find((m) => m.id === msgId);
    const label = msg?.requirement_label ?? "document";

    // Auto-send: trigger next AI message
    const autoText = `I've uploaded my ${label}.`;
    setIsWaitingForAI(true);
    const thinkingId = nanoid();
    setMessages((prev) => [
      ...prev,
      { id: nanoid(), role: "candidate", content: autoText, timestamp: new Date().toISOString() },
      { id: thinkingId, role: "ai", content: "", timestamp: new Date().toISOString(), isTyping: true },
    ]);
    try {
      const resp = await interviewAPI.sendMessage(interviewId, autoText);
      setMessages((prev) => prev.filter((m) => m.id !== thinkingId).concat([{
        id: nanoid(), role: "ai", content: resp.message, timestamp: new Date().toISOString(),
        action: resp.action, requirement_id: resp.requirement_id, requirement_label: resp.requirement_label,
        cardStatus: (resp.action === "request_file" || resp.action === "request_link") ? "idle" : undefined,
      }]));
      if (resp.action === "complete") {
        setProgressPct(100);
        setTimeout(() => setScreen("complete"), 3500);
      }
    } catch { setAiError("Couldn't continue the interview. Please try again."); }
    finally { setIsWaitingForAI(false); }
  }, [messages, interviewId]);

  const handleFileProgress = useCallback((msgId: string, pct: number, fileName?: string) => {
    setMessages((prev) => prev.map((m) =>
      m.id === msgId
        ? { ...m, cardStatus: "uploading", cardProgress: pct, cardFileName: fileName ?? m.cardFileName }
        : m,
    ));
  }, []);

  const handleFileError = useCallback((msgId: string, error: string) => {
    setMessages((prev) => prev.map((m) =>
      m.id === msgId ? { ...m, cardStatus: "error", cardError: error } : m,
    ));
  }, []);

  const handleLinkComplete = useCallback(async (msgId: string, url: string) => {
    setMessages((prev) => prev.map((m) =>
      m.id === msgId ? { ...m, cardStatus: "complete", cardUrl: url } : m,
    ));

    const msg = messages.find((m) => m.id === msgId);
    const label = msg?.requirement_label ?? "link";
    const autoText = `Here's my ${label}: ${url}`;
    setIsWaitingForAI(true);
    const thinkingId = nanoid();
    setMessages((prev) => [
      ...prev,
      { id: nanoid(), role: "candidate", content: autoText, timestamp: new Date().toISOString() },
      { id: thinkingId, role: "ai", content: "", timestamp: new Date().toISOString(), isTyping: true },
    ]);
    try {
      const resp = await interviewAPI.sendMessage(interviewId, autoText);
      setMessages((prev) => prev.filter((m) => m.id !== thinkingId).concat([{
        id: nanoid(), role: "ai", content: resp.message, timestamp: new Date().toISOString(),
        action: resp.action, requirement_id: resp.requirement_id, requirement_label: resp.requirement_label,
        cardStatus: (resp.action === "request_file" || resp.action === "request_link") ? "idle" : undefined,
      }]));
      if (resp.action === "complete") {
        setProgressPct(100);
        setTimeout(() => setScreen("complete"), 3500);
      }
    } catch { setAiError("Couldn't continue the interview. Please try again."); }
    finally { setIsWaitingForAI(false); }
  }, [messages, interviewId]);

  const handleLinkError = useCallback((msgId: string, error: string) => {
    setMessages((prev) => prev.map((m) =>
      m.id === msgId ? { ...m, cardStatus: "error", cardError: error } : m,
    ));
  }, []);

  // ── Keyboard handler for textarea ─────────────────────────────────────────
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

      {/* Message list */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[680px] mx-auto px-4 py-8 space-y-6 pb-40">
          {messages.map((msg, i) => {
            if (msg.role === "ai") {
              return (
                <AIMessageBubble
                  key={msg.id}
                  message={msg}
                  interviewId={interviewId}
                  onFileComplete={handleFileComplete}
                  onFileProgress={handleFileProgress}
                  onFileError={handleFileError}
                  onLinkComplete={handleLinkComplete}
                  onLinkError={handleLinkError}
                />
              );
            }
            // Candidate message — show timestamp if > 60s since last shown
            const msgTime = new Date(msg.timestamp).getTime();
            const prevMsg = messages[i - 1];
            const prevTime = prevMsg ? new Date(prevMsg.timestamp).getTime() : 0;
            const showTs = (msgTime - prevTime) > 60_000;
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

      {/* Fixed bottom input */}
      <div className="fixed bottom-0 left-0 right-0 bg-[var(--bg)] border-t border-border">
        <div className="max-w-[680px] mx-auto px-4 py-3">
          {aiError && (
            <p className="text-[12px] text-danger mb-2 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />{aiError}
            </p>
          )}
          {hasCardPending && (
            <p className="text-[12px] text-muted mb-2">
              Please complete the item above before continuing.
            </p>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={hasCardPending ? "Complete the upload above first…" : "Type your answer…"}
              disabled={isWaitingForAI || hasCardPending}
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
        </div>
      </div>
    </div>
  );
}
