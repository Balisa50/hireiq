"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Download, CheckCircle2, XCircle, ChevronDown, ChevronUp, Clock, Calendar, Mail } from "lucide-react";
import { candidatesAPI } from "@/lib/api";
import type { Interview } from "@/lib/types";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";

// ── Transcript normaliser — handles both old Q&A format and new conversation format ──

interface TranscriptPair { question: string; answer: string }

// Personal detail phrases — filter these out of the transcript view.
// Recruiters only want to see substantive role Q&A, not "What's your phone number?"
const PERSONAL_RE = /\b(your name|full name|email address|phone number|phone|location|where are you|currently based|currently employed|employment status|working at|confirm your)\b/i;

function normaliseTranscript(raw: unknown[]): TranscriptPair[] {
  if (!raw?.length) return [];
  const first = raw[0] as Record<string, unknown>;

  if (first.role) {
    // New conversation format: [{role: 'ai'|'candidate', content, action?}]
    const pairs: TranscriptPair[] = [];
    for (let i = 0; i < raw.length; i++) {
      const msg = raw[i] as Record<string, unknown>;
      if (msg.role !== "ai") continue;
      const action = String(msg.action ?? "continue");
      if (action === "request_file" || action === "request_link") continue;

      const aiContent = String(msg.content ?? "").trim();
      if (!aiContent) continue;

      // Skip personal detail collection exchanges
      if (PERSONAL_RE.test(aiContent) && aiContent.length < 160) continue;

      const next = raw[i + 1] as Record<string, unknown> | undefined;
      if (next?.role === "candidate") {
        const answer = String(next.content ?? "").trim();
        // Skip very short answers (name confirmations, one-word replies)
        if (answer.split(" ").length < 5) continue;
        pairs.push({ question: aiContent, answer });
      }
    }
    return pairs;
  }

  // Old Q&A format: [{question_index, question, answer}]
  return (raw as Record<string, unknown>[]).map((e) => ({
    question: String(e.question ?? ""),
    answer:   String(e.answer ?? ""),
  }));
}

// ── Markdown stripper for transcript answers ──────────────────────────────────

function stripMarkdown(text: string): string {
  return text
    // Horizontal rules / separators
    .replace(/^-{3,}\s*$/gm, "")
    // ATX headings (#, ##, etc.)
    .replace(/^#{1,6}\s+/gm, "")
    // Blockquotes
    .replace(/^>\s?/gm, "")
    // Bold + italic (**text**, *text*, __text__, _text_)
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    // Inline code
    .replace(/`([^`]+)`/g, "$1")
    // Ordered lists (1. 2. etc.) — keep text, remove numbering prefix
    .replace(/^\s*\d+\.\s+/gm, "")
    // Unordered lists (- * +)
    .replace(/^\s*[-*+]\s+/gm, "")
    // Collapse 3+ consecutive blank lines to 2
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Score ring (SVG animated) ─────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r   = 52;
  const circ = 2 * Math.PI * r;
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    const start = performance.now();
    const dur   = 1000;
    function tick(now: number) {
      const t   = Math.min((now - start) / dur, 1);
      const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic
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

// ── Score bar (animated) ──────────────────────────────────────────────────────

function ScoreBar({ label, score, delay }: { label: string; score: number; delay: number }) {
  const [width, setWidth] = useState(0);
  const color = score >= 70 ? "#16A34A" : score >= 50 ? "#D97706" : "#DC2626";

  useEffect(() => {
    const t = setTimeout(() => setWidth(score), delay);
    return () => clearTimeout(t);
  }, [score, delay]);

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

// ── Section card ──────────────────────────────────────────────────────────────

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

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    shortlisted: { label: "Shortlisted", color: "text-success", bg: "bg-green-50 border-success/20" },
    rejected:    { label: "Rejected",    color: "text-danger",  bg: "bg-red-50 border-danger/20" },
    scored:      { label: "Scored",      color: "text-sub",     bg: "bg-[var(--bg)] border-border" },
    completed:   { label: "Completed",   color: "text-sub",     bg: "bg-[var(--bg)] border-border" },
    in_progress: { label: "In Progress", color: "text-warn",    bg: "bg-amber-50 border-amber-200" },
  };
  const cfg = map[status] ?? { label: status, color: "text-muted", bg: "bg-[var(--bg)] border-border" };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-[4px] text-[12px] font-semibold border ${cfg.color} ${cfg.bg}`}>
      {cfg.label}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CandidateReportPage() {
  const { id }     = useParams<{ id: string }>();
  const router     = useRouter();
  const [interview, setInterview]       = useState<Interview | null>(null);
  const [isLoading, setIsLoading]       = useState(true);
  const [error, setError]               = useState("");
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  useEffect(() => {
    candidatesAPI.getInterview(id)
      .then(setInterview)
      .catch(() => setError("Report not found or couldn't be loaded."))
      .finally(() => setIsLoading(false));
  }, [id]);

  const updateStatus = useCallback(async (newStatus: "shortlisted" | "rejected") => {
    if (!interview) return;
    setStatusUpdating(true);
    try {
      await candidatesAPI.updateCandidateStatus(interview.id, newStatus);
      setInterview((p) => p ? { ...p, status: newStatus } : p);
    } catch { /* silent */ }
    finally { setStatusUpdating(false); }
  }, [interview]);

  const downloadPdf = useCallback(() => {
    if (!interview) return;
    window.open(candidatesAPI.getPdfReportUrl(interview.id), "_blank");
  }, [interview]);

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

  const isScored = interview.status !== "in_progress" && interview.overall_score !== null;
  const duration = interview.completed_at && interview.started_at
    ? Math.max(1, Math.round((new Date(interview.completed_at).getTime() - new Date(interview.started_at).getTime()) / 60_000))
    : null;
  const completedDate = interview.completed_at
    ? new Date(interview.completed_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <div className="max-w-[720px] mx-auto space-y-5 pb-12">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-ink" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
            {interview.candidate_name}
          </h1>
          <div className="flex flex-wrap items-center gap-4 mt-1.5">
            <span className="flex items-center gap-1.5 text-[13px] text-sub"><Mail className="w-3.5 h-3.5" />{interview.candidate_email}</span>
            {duration && <span className="flex items-center gap-1.5 text-[13px] text-sub"><Clock className="w-3.5 h-3.5" />{duration} minutes</span>}
            {completedDate && <span className="flex items-center gap-1.5 text-[13px] text-sub"><Calendar className="w-3.5 h-3.5" />{completedDate}</span>}
          </div>
          <div className="mt-2"><StatusBadge status={interview.status} /></div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isScored && (
            <Button variant="secondary" size="sm" onClick={downloadPdf}>
              <Download className="w-3.5 h-3.5" /> PDF Report
            </Button>
          )}
          {interview.status !== "shortlisted" && (
            <Button size="sm" isLoading={statusUpdating} onClick={() => updateStatus("shortlisted")}>
              <CheckCircle2 className="w-3.5 h-3.5" /> Shortlist
            </Button>
          )}
          {interview.status !== "rejected" && (
            <Button variant="danger" size="sm" isLoading={statusUpdating} onClick={() => updateStatus("rejected")}>
              <XCircle className="w-3.5 h-3.5" /> Reject
            </Button>
          )}
        </div>
      </div>

      {/* Not scored yet */}
      {!isScored && (
        <div className="bg-white border border-border rounded-[4px] p-8 text-center">
          <p className="text-sub text-sm">This interview is still in progress. The AI assessment will appear once the candidate submits.</p>
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
            <Card title="Recommended Human Interview Questions">
              <ol className="space-y-3">
                {interview.recommended_follow_up_questions.map((q, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-ink">
                    <span className="w-5 h-5 rounded-full border border-border flex items-center justify-center text-[11px] text-muted font-medium shrink-0 mt-0.5">{i + 1}</span>
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
                  <span>View full interview transcript</span>
                  {transcriptOpen ? <ChevronUp className="w-4 h-4 text-muted" /> : <ChevronDown className="w-4 h-4 text-muted" />}
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

          {/* Bottom actions */}
          <div className="flex items-center gap-3">
            {isScored && (
              <Button variant="secondary" onClick={downloadPdf}>
                <Download className="w-4 h-4" /> Download PDF Report
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
