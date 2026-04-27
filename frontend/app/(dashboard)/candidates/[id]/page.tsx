"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Download, CheckCircle2, XCircle, ChevronDown, ChevronUp,
  Clock, Calendar, Mail, RefreshCw, Send, X, Star, Trash2, AlertTriangle,
} from "lucide-react";
import { candidatesAPI } from "@/lib/api";
import type { Interview } from "@/lib/types";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";

// ── Transcript normaliser ─────────────────────────────────────────────────────

interface TranscriptPair { question: string; answer: string }

const PERSONAL_RE = /\b(your name|full name|email address|phone number|phone|location|where are you|currently based|currently employed|employment status|working at|confirm your)\b/i;

function normaliseTranscript(raw: unknown[]): TranscriptPair[] {
  if (!raw?.length) return [];
  const first = raw[0] as Record<string, unknown>;

  if (first.role) {
    const pairs: TranscriptPair[] = [];
    for (let i = 0; i < raw.length; i++) {
      const msg = raw[i] as Record<string, unknown>;
      if (msg.role !== "ai") continue;
      const action = String(msg.action ?? "continue");
      if (action === "request_file" || action === "request_link") continue;
      const aiContent = String(msg.content ?? "").trim();
      if (!aiContent) continue;
      if (PERSONAL_RE.test(aiContent) && aiContent.length < 160) continue;
      const next = raw[i + 1] as Record<string, unknown> | undefined;
      if (next?.role === "candidate") {
        const answer = String(next.content ?? "").trim();
        if (answer.split(" ").length < 5) continue;
        pairs.push({ question: aiContent, answer });
      }
    }
    return pairs;
  }

  return (raw as Record<string, unknown>[]).map((e) => ({
    question: String(e.question ?? ""),
    answer:   String(e.answer ?? ""),
  }));
}

function stripMarkdown(text: string): string {
  return text
    .replace(/^-{3,}\s*$/gm, "").replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "").replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2").replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*\d+\.\s+/gm, "").replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n").trim();
}

// ── Score ring ────────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r    = 52;
  const circ = 2 * Math.PI * r;
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    const start = performance.now();
    const dur   = 1000;
    function tick(now: number) {
      const t    = Math.min((now - start) / dur, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setDisplayed(Math.round(score * ease));
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [score]);

  const offset = circ * (1 - displayed / 100);
  const color  = score >= 70 ? "#16A34A" : score >= 50 ? "#D97706" : "#DC2626";
  const label  = score >= 70 ? "Strong candidate" : score >= 50 ? "Good candidate" : score >= 35 ? "Average candidate" : "Weak candidate";

  return (
    <div className="flex flex-col items-center">
      <svg width="140" height="140" viewBox="0 0 140 140" className="-rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#E8E4DF" strokeWidth="10" />
        <circle cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.016s linear" }} />
      </svg>
      <div className="-mt-[100px] mb-[60px] flex flex-col items-center">
        <span className="text-[48px] font-bold text-ink leading-none">{displayed}</span>
        <span className="text-[13px] text-muted mt-1">Overall Fit Score</span>
      </div>
      <p className="text-[13px] font-medium" style={{ color }}>{label}</p>
    </div>
  );
}

function ScoreBar({ label, score, delay }: { label: string; score: number; delay: number }) {
  const [width, setWidth] = useState(0);
  const color = score >= 70 ? "#16A34A" : score >= 50 ? "#D97706" : "#DC2626";
  useEffect(() => { const t = setTimeout(() => setWidth(score), delay); return () => clearTimeout(t); }, [score, delay]);
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[13px] text-sub">{label}</span>
        <span className="text-[13px] font-semibold text-ink">{score}/100</span>
      </div>
      <div className="h-2 rounded-full bg-border overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${width}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function Card({ title, label, children }: { title: string; label?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-border rounded-[4px] p-6">
      <p className={`text-[11px] font-semibold uppercase tracking-widest mb-4 ${label === "amber" ? "text-warn" : label === "green" ? "text-success" : "text-muted"}`}>
        {title}
      </p>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    shortlisted: { label: "Shortlisted", color: "text-success",  bg: "bg-green-50 border-success/20" },
    accepted:    { label: "Accepted",    color: "text-blue-600", bg: "bg-blue-50 border-blue-200" },
    rejected:    { label: "Rejected",    color: "text-danger",   bg: "bg-red-50 border-danger/20" },
    scored:      { label: "Scored",      color: "text-sub",      bg: "bg-[var(--bg)] border-border" },
    completed:   { label: "Completed",   color: "text-sub",      bg: "bg-[var(--bg)] border-border" },
    in_progress: { label: "In Progress", color: "text-warn",     bg: "bg-amber-50 border-amber-200" },
  };
  const cfg = map[status] ?? { label: status, color: "text-muted", bg: "bg-[var(--bg)] border-border" };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-[4px] text-[12px] font-semibold border ${cfg.color} ${cfg.bg}`}>
      {cfg.label}
    </span>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spinner({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ── Email Panel ───────────────────────────────────────────────────────────────

type EmailStatus = "shortlisted" | "rejected" | "accepted";
type EmailTone   = "professional" | "warm" | "direct";

interface EmailPanelProps {
  interviewId: string;
  candidateName: string;
  candidateEmail: string;
  emailStatus: EmailStatus;
  onClose: () => void;
}

function EmailPanel({ interviewId, candidateName, candidateEmail, emailStatus, onClose }: EmailPanelProps) {
  const [tone, setTone]             = useState<EmailTone>("professional");
  const [subject, setSubject]       = useState("");
  const [body, setBody]             = useState("");
  const [generating, setGenerating] = useState(false);
  const [sending, setSending]       = useState(false);
  const [sent, setSent]             = useState(false);
  const [genError, setGenError]     = useState("");
  const [sendError, setSendError]   = useState("");
  const [previewMode, setPreviewMode] = useState(false);
  const bodyRef          = useRef<HTMLTextAreaElement>(null);
  const generationAbort  = useRef(false);

  const firstName = candidateName.split(" ")[0] || candidateName;

  const statusLabel: Record<EmailStatus, string> = {
    shortlisted: "Shortlist notification",
    rejected:    "Rejection",
    accepted:    "Offer progression",
  };

  const generate = useCallback(async (selectedTone: EmailTone) => {
    generationAbort.current = false;
    setGenerating(true);
    setPreviewMode(false); // always return to edit view on regen
    setGenError("");
    try {
      const draft = await candidatesAPI.generateEmail(interviewId, emailStatus, selectedTone);
      if (!generationAbort.current) {
        setSubject(draft.subject);
        setBody(draft.body);
      }
    } catch {
      if (!generationAbort.current) setGenError("Generation failed. Try again.");
    } finally {
      if (!generationAbort.current) setGenerating(false);
    }
  }, [interviewId, emailStatus]);

  // Auto-generate on mount
  useEffect(() => {
    generate("professional");
    return () => { generationAbort.current = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (!bodyRef.current || previewMode) return;
    bodyRef.current.style.height = "auto";
    bodyRef.current.style.height = `${bodyRef.current.scrollHeight}px`;
  }, [body, previewMode]);

  const handleTone = (t: EmailTone) => {
    setTone(t);
    generate(t);
  };

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) return;
    setSending(true);
    setSendError("");
    try {
      const result = await candidatesAPI.sendEmail(interviewId, subject.trim(), body.trim());
      if (result.sent) {
        setSent(true);
        setTimeout(onClose, 1800);
      } else {
        setSendError(result.message);
      }
    } catch {
      setSendError("Send failed. Check your SMTP settings or try again.");
    } finally {
      setSending(false);
    }
  };

  const TONES: { value: EmailTone; label: string }[] = [
    { value: "professional", label: "Professional" },
    { value: "warm",         label: "Warm" },
    { value: "direct",       label: "Direct" },
  ];

  const statusColor: Record<EmailStatus, string> = {
    shortlisted: "text-success border-success/30 bg-green-50",
    rejected:    "text-danger border-danger/30 bg-red-50",
    accepted:    "text-blue-600 border-blue-200 bg-blue-50",
  };

  const hasDraft = !generating && !genError && subject;

  return (
    <div className="bg-white border border-border rounded-[4px] overflow-hidden">
      {/* Panel header */}
      <div className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Mail className="w-4 h-4 text-muted shrink-0" />
          <span className="text-[13px] font-semibold text-ink truncate">
            Email to {firstName}
          </span>
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${statusColor[emailStatus]}`}>
            {statusLabel[emailStatus]}
          </span>
        </div>
        <button onClick={onClose} className="text-muted hover:text-ink transition-colors shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Controls row: tone pills + edit/preview toggle */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Tone selector */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted font-medium uppercase tracking-wider mr-1">Tone</span>
            {TONES.map((t) => (
              <button
                key={t.value}
                onClick={() => handleTone(t.value)}
                disabled={generating}
                className={`px-3 py-1 rounded-full text-[12px] font-medium border transition-colors disabled:opacity-40 ${
                  tone === t.value
                    ? "bg-[#1A1714] text-white border-[#1A1714]"
                    : "border-border text-sub hover:border-ink hover:text-ink"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Edit / Preview toggle — only shown when a draft exists */}
          {hasDraft && (
            <div className="flex items-center rounded-[4px] border border-border bg-[var(--bg)] p-0.5 shrink-0">
              <button
                onClick={() => setPreviewMode(false)}
                className={`px-3 py-1 text-[12px] font-medium rounded-[3px] transition-colors ${
                  !previewMode ? "bg-white text-ink shadow-sm" : "text-muted hover:text-sub"
                }`}
              >
                Edit
              </button>
              <button
                onClick={() => setPreviewMode(true)}
                className={`px-3 py-1 text-[12px] font-medium rounded-[3px] transition-colors ${
                  previewMode ? "bg-white text-ink shadow-sm" : "text-muted hover:text-sub"
                }`}
              >
                Preview
              </button>
            </div>
          )}
        </div>

        {/* Generating state */}
        {generating && (
          <div className="flex items-center gap-2.5 py-6 justify-center text-muted">
            <Spinner className="w-4 h-4" />
            <span className="text-[13px]">Generating draft…</span>
          </div>
        )}

        {/* Generation error */}
        {genError && !generating && (
          <div className="text-[13px] text-danger flex items-center gap-2">
            <span>{genError}</span>
            <button
              onClick={() => generate(tone)}
              className="underline underline-offset-2 hover:no-underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Draft content */}
        {hasDraft && (
          previewMode ? (
            /* ── PREVIEW MODE ──────────────────────────────────────────────── */
            <div className="border border-border rounded-[4px] overflow-hidden text-[13px]">
              {/* Email headers */}
              <div className="px-4 py-3 bg-[var(--bg)] border-b border-border space-y-1.5">
                <div className="grid grid-cols-[44px_1fr] gap-2 items-baseline">
                  <span className="text-[11px] text-muted font-medium uppercase tracking-wide">From</span>
                  <span className="text-ink">Your Company</span>
                </div>
                <div className="grid grid-cols-[44px_1fr] gap-2 items-baseline">
                  <span className="text-[11px] text-muted font-medium uppercase tracking-wide">To</span>
                  <span className="text-ink">{candidateName} &lt;{candidateEmail}&gt;</span>
                </div>
                <div className="grid grid-cols-[44px_1fr] gap-2 items-baseline">
                  <span className="text-[11px] text-muted font-medium uppercase tracking-wide">Subject</span>
                  <span className="text-ink font-semibold">{subject || "—"}</span>
                </div>
              </div>
              {/* Body rendered */}
              <div className="px-5 py-5 bg-white">
                {body.split("\n\n").map((para, i) => (
                  para.trim() ? (
                    <p key={i} className={`text-[14px] text-ink leading-[1.75] ${i > 0 ? "mt-4" : ""}`}>
                      {para.split("\n").map((line, j) => (
                        <React.Fragment key={j}>
                          {j > 0 && <br />}
                          {line}
                        </React.Fragment>
                      ))}
                    </p>
                  ) : null
                ))}
              </div>
              <div className="px-5 py-2.5 bg-[var(--bg)] border-t border-border">
                <p className="text-[11px] text-muted">
                  This is how the email will appear in the candidate&apos;s inbox.
                  Switch to Edit to make changes before sending.
                </p>
              </div>
            </div>
          ) : (
            /* ── EDIT MODE ─────────────────────────────────────────────────── */
            <>
              {/* Subject */}
              <div>
                <label className="block text-[11px] text-muted font-medium uppercase tracking-wider mb-1.5">
                  Subject
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full bg-[var(--bg)] border border-border rounded-[4px] px-3 py-2 text-[13px] text-ink outline-none focus:border-ink transition-colors"
                />
              </div>

              {/* Body */}
              <div>
                <label className="block text-[11px] text-muted font-medium uppercase tracking-wider mb-1.5">
                  Body
                </label>
                <textarea
                  ref={bodyRef}
                  value={body}
                  onChange={(e) => {
                    setBody(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${e.target.scrollHeight}px`;
                  }}
                  className="w-full bg-[var(--bg)] border border-border rounded-[4px] px-3 py-2.5 text-[13px] text-ink leading-relaxed outline-none focus:border-ink transition-colors resize-none"
                  style={{ minHeight: "160px" }}
                />
                <p className="text-[11px] text-muted mt-1">To: {candidateEmail}</p>
              </div>
            </>
          )
        )}

        {/* Send error */}
        {sendError && (
          <p className="text-[12px] text-danger">{sendError}</p>
        )}

        {/* Sent confirmation */}
        {sent && (
          <div className="flex items-center gap-2 text-success text-[13px]">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Email sent to {candidateEmail}
          </div>
        )}

        {/* Actions */}
        {!sent && hasDraft && (
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={() => generate(tone)}
              disabled={generating}
              className="flex items-center gap-1.5 text-[12px] text-sub hover:text-ink transition-colors disabled:opacity-40"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Regenerate
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-[13px] text-sub hover:text-ink border border-border rounded-[4px] hover:border-ink transition-colors"
              >
                Skip
              </button>
              <button
                onClick={handleSend}
                disabled={sending || !subject.trim() || !body.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-[#1A1714] text-white text-[13px] font-medium rounded-[4px] hover:bg-[#2d2926] transition-colors disabled:opacity-40"
              >
                {sending ? <Spinner className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
                Send email
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Delete Confirmation Modal ─────────────────────────────────────────────────

function DeleteConfirmModal({
  candidateName,
  onConfirm,
  onCancel,
  isDeleting,
}: {
  candidateName: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onCancel}
      />
      {/* Modal */}
      <div className="relative bg-white border border-border rounded-[4px] shadow-xl max-w-sm w-full p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-red-50 border border-danger/20 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4 text-danger" />
          </div>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-ink">Delete candidate?</h2>
            <p className="text-[13px] text-sub mt-1 leading-relaxed">
              This will permanently remove{" "}
              <strong>{candidateName}</strong> and everything associated with
              them — their application, transcript, AI score report, and all
              uploaded documents.{" "}
              <strong className="text-ink">This cannot be undone.</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="px-4 py-2 text-[13px] text-sub hover:text-ink border border-border rounded-[4px] hover:border-ink transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex items-center gap-2 px-4 py-2 bg-danger text-white text-[13px] font-medium rounded-[4px] hover:bg-red-700 transition-colors disabled:opacity-40"
          >
            {isDeleting ? (
              <><Spinner className="w-3.5 h-3.5" /> Deleting…</>
            ) : (
              <><Trash2 className="w-3.5 h-3.5" /> Delete permanently</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}


// ── Main page ─────────────────────────────────────────────────────────────────

export default function CandidateReportPage() {
  const { id }  = useParams<{ id: string }>();
  const router  = useRouter();

  const [interview, setInterview]           = useState<Interview | null>(null);
  const [isLoading, setIsLoading]           = useState(true);
  const [error, setError]                   = useState("");
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  // Email panel
  const [emailPanel, setEmailPanel] = useState<EmailStatus | null>(null);

  // Delete modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting]           = useState(false);
  const [deleteError, setDeleteError]         = useState("");

  useEffect(() => {
    candidatesAPI.getInterview(id)
      .then(setInterview)
      .catch(() => setError("Report not found or couldn't be loaded."))
      .finally(() => setIsLoading(false));
  }, [id]);

  const updateStatus = useCallback(async (newStatus: "shortlisted" | "rejected" | "accepted") => {
    if (!interview) return;
    setStatusUpdating(true);
    try {
      await candidatesAPI.updateCandidateStatus(interview.id, newStatus);
      setInterview((p) => p ? { ...p, status: newStatus } : p);
      // Open email panel immediately after status saves
      setEmailPanel(newStatus);
    } catch { /* silent */ }
    finally { setStatusUpdating(false); }
  }, [interview]);

  const [pdfDownloading, setPdfDownloading] = useState(false);

  const downloadPdf = useCallback(async () => {
    if (!interview) return;
    setPdfDownloading(true);
    try {
      await candidatesAPI.downloadPdfReport(interview.id, interview.candidate_name);
    } catch {
      // swallow — user can retry
    } finally {
      setPdfDownloading(false);
    }
  }, [interview]);

  const handleDelete = useCallback(async () => {
    if (!interview) return;
    setIsDeleting(true);
    setDeleteError("");
    try {
      await candidatesAPI.deleteCandidate(interview.id);
      router.push("/candidates");
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Deletion failed. Please try again.");
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  }, [interview, router]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="max-w-[720px] mx-auto space-y-5 pb-12">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-32" />
        <div className="bg-white border border-border rounded-[4px] p-6 space-y-4">
          <Skeleton className="h-32 w-32 rounded-full mx-auto" />
          <Skeleton className="h-4 w-24 mx-auto" />
        </div>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white border border-border rounded-[4px] p-6 space-y-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        ))}
      </div>
    );
  }

  if (error || !interview) {
    return (
      <div className="max-w-[720px] mx-auto py-20 text-center">
        <p className="text-sub mb-4">{error || "Report not found."}</p>
        <button onClick={() => router.back()} className="text-[13px] text-sub hover:text-ink underline transition-colors">
          ← Back to Candidates
        </button>
      </div>
    );
  }

  const isScored      = interview.status !== "in_progress" && interview.overall_score !== null;
  const duration      = interview.completed_at && interview.started_at
    ? Math.max(1, Math.round((new Date(interview.completed_at).getTime() - new Date(interview.started_at).getTime()) / 60_000))
    : null;
  const completedDate = interview.completed_at
    ? new Date(interview.completed_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;

  const canShortlist = interview.status !== "shortlisted" && interview.status !== "accepted";
  const canReject    = interview.status !== "rejected";
  const canAccept    = interview.status !== "accepted";

  return (
    <div className="max-w-[720px] mx-auto space-y-5 pb-12">
      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <DeleteConfirmModal
          candidateName={interview.candidate_name}
          onConfirm={handleDelete}
          onCancel={() => { setShowDeleteModal(false); setDeleteError(""); }}
          isDeleting={isDeleting}
        />
      )}

      {/* Delete error banner */}
      {deleteError && (
        <div className="flex items-center gap-2 rounded-[4px] bg-red-50 border border-danger/20 px-3 py-2.5 text-[13px] text-danger">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {deleteError}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-ink" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
            {interview.candidate_name}
          </h1>
          <div className="flex flex-wrap items-center gap-4 mt-1.5">
            <span className="flex items-center gap-1.5 text-[13px] text-sub">
              <Mail className="w-3.5 h-3.5" />{interview.candidate_email}
            </span>
            {duration && (
              <span className="flex items-center gap-1.5 text-[13px] text-sub">
                <Clock className="w-3.5 h-3.5" />{duration} minutes
              </span>
            )}
            {completedDate && (
              <span className="flex items-center gap-1.5 text-[13px] text-sub">
                <Calendar className="w-3.5 h-3.5" />{completedDate}
              </span>
            )}
          </div>
          <div className="mt-2"><StatusBadge status={interview.status} /></div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isScored && (
            <Button variant="secondary" size="sm" onClick={downloadPdf} isLoading={pdfDownloading}>
              <Download className="w-3.5 h-3.5" /> PDF Report
            </Button>
          )}
          {canShortlist && (
            <Button size="sm" isLoading={statusUpdating} onClick={() => updateStatus("shortlisted")}>
              <CheckCircle2 className="w-3.5 h-3.5" /> Shortlist
            </Button>
          )}
          {canAccept && (
            <button
              disabled={statusUpdating}
              onClick={() => updateStatus("accepted")}
              className="inline-flex items-center justify-center gap-2 text-[13px] font-medium px-3 py-1.5 h-8 bg-blue-600 text-white rounded-[4px] hover:bg-blue-700 transition-colors disabled:opacity-40"
            >
              {statusUpdating ? <Spinner className="w-3.5 h-3.5" /> : <Star className="w-3.5 h-3.5" />}
              Accept
            </button>
          )}
          {canReject && (
            <Button variant="danger" size="sm" isLoading={statusUpdating} onClick={() => updateStatus("rejected")}>
              <XCircle className="w-3.5 h-3.5" /> Reject
            </Button>
          )}

          {/* Separator — visually isolates the destructive action */}
          <div className="w-px h-6 bg-border mx-1 shrink-0" />

          <button
            onClick={() => setShowDeleteModal(true)}
            title="Delete candidate permanently"
            className="w-8 h-8 flex items-center justify-center rounded-[4px] border border-border text-muted hover:border-danger hover:text-danger transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Email panel — appears immediately after status change */}
      {emailPanel && (
        <EmailPanel
          interviewId={interview.id}
          candidateName={interview.candidate_name}
          candidateEmail={interview.candidate_email}
          emailStatus={emailPanel}
          onClose={() => setEmailPanel(null)}
        />
      )}

      {/* Not scored yet */}
      {!isScored && (
        <div className="bg-white border border-border rounded-[4px] p-8 text-center">
          <p className="text-sub text-sm">
            This application is still in progress. The AI assessment will appear once the candidate submits.
          </p>
        </div>
      )}

      {isScored && (
        <>
          {/* Score ring */}
          <div className="bg-white border border-border rounded-[4px] p-8 flex flex-col items-center">
            <ScoreRing score={interview.overall_score!} />
          </div>

          {/* Score breakdown */}
          {interview.score_breakdown && Object.keys(interview.score_breakdown).length > 0 && (
            <Card title="Score Breakdown">
              <div className="space-y-4">
                {Object.entries(interview.score_breakdown).map(([area, score], i) => (
                  <ScoreBar key={area} label={area} score={score} delay={i * 100} />
                ))}
              </div>
            </Card>
          )}

          {/* AI Assessment */}
          {interview.executive_summary && (
            <Card title="AI Assessment">
              <p className="text-[15px] text-ink leading-[1.8]">{interview.executive_summary}</p>
              {interview.hiring_recommendation && (
                <div className="mt-4 pt-4 border-t border-border">
                  <span className="text-[11px] font-semibold text-muted uppercase tracking-widest">Recommendation: </span>
                  <span className="text-[13px] font-semibold text-ink">{interview.hiring_recommendation}</span>
                </div>
              )}
            </Card>
          )}

          {/* Strengths + Concerns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {interview.key_strengths?.length ? (
              <Card title="Key Strengths" label="green">
                <ul className="space-y-2.5">
                  {interview.key_strengths.map((s, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-ink">
                      <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0 mt-1.5" />
                      {s}
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
            {interview.areas_of_concern?.length ? (
              <Card title="Areas of Concern" label="amber">
                <ul className="space-y-2.5">
                  {interview.areas_of_concern.map((c, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-ink">
                      <span className="w-1.5 h-1.5 rounded-full bg-warn shrink-0 mt-1.5" />
                      {c}
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </div>

          {/* Follow-up questions */}
          {interview.recommended_follow_up_questions?.length ? (
            <Card title="Suggested In-Person Questions">
              <ol className="space-y-3">
                {interview.recommended_follow_up_questions.map((q, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-ink">
                    <span className="w-5 h-5 rounded-full border border-border flex items-center justify-center text-[11px] text-muted font-medium shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    {q}
                  </li>
                ))}
              </ol>
            </Card>
          ) : null}

          {/* Transcript */}
          {interview.transcript?.length > 0 && (() => {
            const pairs = normaliseTranscript(interview.transcript as unknown[]);
            return pairs.length > 0 ? (
              <div className="bg-white border border-border rounded-[4px] overflow-hidden">
                <button
                  onClick={() => setTranscriptOpen((v) => !v)}
                  className="w-full px-6 py-4 flex items-center justify-between text-sm font-medium text-ink hover:bg-[var(--bg)] transition-colors"
                >
                  <span>View full application transcript</span>
                  {transcriptOpen
                    ? <ChevronUp className="w-4 h-4 text-muted" />
                    : <ChevronDown className="w-4 h-4 text-muted" />}
                </button>
                {transcriptOpen && (
                  <div className="px-6 pb-6 space-y-5 border-t border-border pt-5">
                    {pairs.map((pair, i) => (
                      <div key={i}>
                        <p className="text-[13px] font-semibold text-muted mb-1.5">Q{i + 1}. {pair.question}</p>
                        <p className="text-sm text-ink leading-relaxed bg-[var(--bg)] border border-border rounded-[4px] px-4 py-3 whitespace-pre-wrap">
                          {stripMarkdown(pair.answer)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null;
          })()}

          {/* Bottom PDF button */}
          <div className="flex items-center gap-3">
            {isScored && (
              <Button variant="secondary" onClick={downloadPdf} isLoading={pdfDownloading}>
                <Download className="w-4 h-4" /> Download PDF Report
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
