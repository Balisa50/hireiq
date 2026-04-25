"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Download, CheckCircle2, XCircle,
  User, Mail, Clock, Calendar, TrendingUp,
  MessageSquare, AlertTriangle, Star,
} from "lucide-react";
import { candidatesAPI } from "@/lib/api";
import type { Interview } from "@/lib/types";
import Button from "@/components/ui/Button";
import ScoreBadge from "@/components/ui/ScoreBadge";

function ScoreBar({
  label, score, max = 100,
}: {
  label: string; score: number; max?: number;
}) {
  const pct = Math.round((score / max) * 100);
  const barColor =
    pct >= 80 ? "bg-green-400" : pct >= 60 ? "bg-amber-400" : "bg-red-400";
  const textColor =
    pct >= 80 ? "text-green-400" : pct >= 60 ? "text-amber-400" : "text-red-400";
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-2">
        <span className="text-[var(--text-muted)]">{label}</span>
        <span className={`font-bold ${textColor}`}>{score}/100</span>
      </div>
      <div className="h-2 rounded-full bg-white/8 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

const REC_COLORS: Record<string, string> = {
  "Strong Yes": "text-green-400 bg-green-400/10 border-green-400/20",
  "Yes":        "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  "Maybe":      "text-amber-400 bg-amber-400/10 border-amber-400/20",
  "No":         "text-red-400 bg-red-400/10 border-red-400/20",
  "Strong No":  "text-red-500 bg-red-500/10 border-red-500/20",
};

export default function CandidateReportPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [interview, setInterview] = useState<Interview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusUpdating, setStatusUpdating] = useState(false);

  useEffect(() => {
    candidatesAPI
      .getInterview(id)
      .then(setInterview)
      .catch(() => setError("Failed to load candidate report."))
      .finally(() => setIsLoading(false));
  }, [id]);

  const updateStatus = useCallback(
    async (newStatus: "shortlisted" | "rejected") => {
      if (!interview) return;
      setStatusUpdating(true);
      try {
        await candidatesAPI.updateCandidateStatus(interview.id, newStatus);
        setInterview((prev) => (prev ? { ...prev, status: newStatus } : prev));
      } catch {
        alert("Failed to update status. Please try again.");
      } finally {
        setStatusUpdating(false);
      }
    },
    [interview],
  );

  const downloadPdf = useCallback(() => {
    if (!interview) return;
    const url = candidatesAPI.getPdfReportUrl(interview.id);
    window.open(url, "_blank");
  }, [interview]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !interview) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center">
        <p className="text-red-400">{error || "Report not found."}</p>
        <Button variant="ghost" className="mt-4" onClick={() => router.back()}>
          Go Back
        </Button>
      </div>
    );
  }

  const isScored = interview.status !== "in_progress" && interview.overall_score !== null;
  const recColor = REC_COLORS[interview.hiring_recommendation ?? ""] ?? "text-[var(--text-muted)] bg-white/5 border-[var(--border)]";

  const duration =
    interview.completed_at && interview.started_at
      ? Math.max(
          1,
          Math.round(
            (new Date(interview.completed_at).getTime() -
              new Date(interview.started_at).getTime()) /
              60_000,
          ),
        )
      : null;

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in pb-12">
      {/* Back + Actions */}
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Candidates
        </button>
        <div className="flex items-center gap-2">
          {isScored && (
            <Button variant="secondary" size="sm" onClick={downloadPdf}>
              <Download className="w-3.5 h-3.5" /> PDF Report
            </Button>
          )}
          {interview.status !== "shortlisted" && (
            <Button
              variant="primary"
              size="sm"
              isLoading={statusUpdating}
              onClick={() => updateStatus("shortlisted")}
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Shortlist
            </Button>
          )}
          {interview.status !== "rejected" && (
            <Button
              variant="danger"
              size="sm"
              isLoading={statusUpdating}
              onClick={() => updateStatus("rejected")}
            >
              <XCircle className="w-3.5 h-3.5" /> Reject
            </Button>
          )}
        </div>
      </div>

      {/* Hero */}
      <div className="glass rounded-2xl p-6 flex flex-col sm:flex-row items-start gap-5">
        <div className="w-20 h-20 rounded-2xl bg-brand-500/10 border-2 border-brand-500/20 flex flex-col items-center justify-center shrink-0">
          <span
            className={`text-2xl font-extrabold ${
              (interview.overall_score ?? 0) >= 80
                ? "text-green-400"
                : (interview.overall_score ?? 0) >= 60
                ? "text-amber-400"
                : "text-red-400"
            }`}
          >
            {interview.overall_score ?? "—"}
          </span>
          <span className="text-[10px] text-[var(--text-dim)] mt-0.5">/ 100</span>
        </div>
        <div className="flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-white">{interview.candidate_name}</h1>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                  <Mail className="w-3.5 h-3.5" />
                  {interview.candidate_email}
                </span>
                {duration !== null && (
                  <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                    <Clock className="w-3.5 h-3.5" />
                    {duration} minutes
                  </span>
                )}
                {interview.completed_at && (
                  <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(interview.completed_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                )}
              </div>
            </div>
          </div>
          {interview.hiring_recommendation && (
            <span className={`inline-flex items-center mt-3 px-3 py-1 rounded-full text-xs font-semibold border ${recColor}`}>
              Recommendation: {interview.hiring_recommendation}
            </span>
          )}
        </div>
      </div>

      {!isScored ? (
        <div className="glass rounded-2xl p-8 text-center">
          <TrendingUp className="w-10 h-10 text-[var(--text-dim)] mx-auto mb-3" />
          <p className="text-[var(--text-muted)] text-sm">
            This interview is still in progress. The AI assessment will appear once the candidate
            submits.
          </p>
        </div>
      ) : (
        <>
          {/* Executive Summary */}
          {interview.executive_summary && (
            <div className="glass rounded-2xl p-6">
              <h2 className="text-xs font-bold text-[var(--text-dim)] uppercase tracking-wider mb-3">
                AI Executive Summary
              </h2>
              <p className="text-sm text-[var(--text)] leading-relaxed">
                {interview.executive_summary}
              </p>
            </div>
          )}

          {/* Score breakdown */}
          {interview.score_breakdown && Object.keys(interview.score_breakdown).length > 0 && (
            <div className="glass rounded-2xl p-6 space-y-4">
              <h2 className="text-xs font-bold text-[var(--text-dim)] uppercase tracking-wider">
                Score Breakdown
              </h2>
              {Object.entries(interview.score_breakdown).map(([area, score]) => (
                <ScoreBar key={area} label={area} score={score} />
              ))}
            </div>
          )}

          {/* Strengths & Concerns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {interview.key_strengths && (
              <div className="glass rounded-2xl p-5">
                <h2 className="text-xs font-bold text-green-400 uppercase tracking-wider flex items-center gap-1.5 mb-3">
                  <Star className="w-3.5 h-3.5" /> Key Strengths
                </h2>
                <ul className="space-y-2">
                  {interview.key_strengths.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-[var(--text)]">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {interview.areas_of_concern && (
              <div className="glass rounded-2xl p-5">
                <h2 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5 mb-3">
                  <AlertTriangle className="w-3.5 h-3.5" /> Areas of Concern
                </h2>
                <ul className="space-y-2">
                  {interview.areas_of_concern.map((c, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-[var(--text)]">
                      <XCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Follow-up questions */}
          {interview.recommended_follow_up_questions?.length ? (
            <div className="glass rounded-2xl p-5">
              <h2 className="text-xs font-bold text-[var(--text-dim)] uppercase tracking-wider flex items-center gap-1.5 mb-3">
                <MessageSquare className="w-3.5 h-3.5" />
                Recommended Human Interview Questions
              </h2>
              <div className="space-y-2">
                {interview.recommended_follow_up_questions.map((q, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-xl bg-brand-500/5 border border-brand-500/15 px-4 py-3"
                  >
                    <span className="w-5 h-5 rounded-full bg-brand-500/20 text-brand-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <p className="text-sm text-[var(--text)]">{q}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}

      {/* Full transcript */}
      {interview.transcript?.length > 0 && (
        <div className="glass rounded-2xl p-5">
          <h2 className="text-xs font-bold text-[var(--text-dim)] uppercase tracking-wider mb-4">
            Full Interview Transcript
          </h2>
          <div className="space-y-5">
            {interview.transcript.map((entry, i) => (
              <div key={i}>
                <p className="text-xs font-semibold text-brand-400 mb-1.5">
                  Q{i + 1}. {entry.question}
                </p>
                <p className="text-sm text-[var(--text)] leading-relaxed bg-white/3 rounded-xl px-4 py-3 border border-[var(--border)]">
                  {entry.answer}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
