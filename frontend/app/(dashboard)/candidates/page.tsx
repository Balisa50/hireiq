"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { candidatesAPI, jobsAPI } from "@/lib/api";
import type { CandidateSummary, JobSummary } from "@/lib/types";
import ScoreBadge from "@/components/ui/ScoreBadge";
import Skeleton from "@/components/ui/Skeleton";

// ── Status ────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  shortlisted:   { label: "Shortlisted",   color: "text-success" },
  rejected:      { label: "Rejected",      color: "text-muted" },
  scored:        { label: "Scored",        color: "text-sub" },
  completed:     { label: "Completed",     color: "text-sub" },
  in_progress:   { label: "In Progress",   color: "text-warn" },
  auto_rejected: { label: "Auto-Rejected", color: "text-danger" },
};

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyCandidates() {
  return (
    <div className="py-20 text-center">
      <svg className="w-16 h-16 mx-auto mb-5 text-border" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="24" cy="20" r="10" />
        <circle cx="42" cy="22" r="8" />
        <path d="M4 54c0-11 9-18 20-18s20 7 20 18" />
        <path d="M42 34c8 1 14 7 14 16" />
      </svg>
      <h2 className="text-base font-medium text-ink mb-2">No candidates yet</h2>
      <p className="text-sub text-sm max-w-xs mx-auto">Share your application links to start receiving candidates.</p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "",              label: "All Statuses" },
  { value: "scored",        label: "Scored" },
  { value: "shortlisted",   label: "Shortlisted" },
  { value: "rejected",      label: "Rejected" },
  { value: "in_progress",   label: "In Progress" },
  { value: "auto_rejected", label: "Auto-Rejected" },
];

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<CandidateSummary[]>([]);
  const [jobs, setJobs]             = useState<JobSummary[]>([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [error, setError]           = useState("");
  const [jobFilter, setJobFilter]   = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const attemptRef = useRef(0);

  const loadCandidates = useCallback(() => {
    attemptRef.current = 0;
    setIsLoading(true);
    setError("");
    function tryLoad() {
      attemptRef.current += 1;
      candidatesAPI.listCandidates({ job_id: jobFilter || undefined, status: statusFilter || undefined })
        .then((data) => { setCandidates(data); setIsLoading(false); })
        .catch(() => {
          if (attemptRef.current < 3) setTimeout(tryLoad, 900 * attemptRef.current);
          else { setError("Having trouble loading candidates."); setIsLoading(false); }
        });
    }
    tryLoad();
  }, [jobFilter, statusFilter]);

  useEffect(() => { jobsAPI.listJobs().then(setJobs).catch(() => null); }, []);
  useEffect(() => { loadCandidates(); }, [loadCandidates]);

  const selectClass = "bg-white border border-border rounded-[4px] px-3 py-2 text-[13px] text-ink outline-none focus:border-ink transition-colors cursor-pointer appearance-none";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Candidates</h1>
        <p className="text-sub text-sm mt-1">All applicants ranked by AI score. Click any row to view the full report.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select value={jobFilter} onChange={(e) => setJobFilter(e.target.value)} className={selectClass}>
          <option value="">All Jobs</option>
          {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectClass}>
          {STATUS_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      {/* Amber error banner */}
      {error && (
        <div className="rounded-[4px] bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700 flex items-center justify-between gap-4">
          <span>{error} Retry →</span>
          <button onClick={loadCandidates} className="font-medium underline shrink-0">Retry</button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-border rounded-[4px] overflow-hidden">
        <div className="hidden md:grid grid-cols-[64px_2fr_2fr_100px_72px_100px_100px] gap-4 px-5 py-3 bg-[var(--bg)] border-b border-border">
          {["Rank", "Candidate", "Role", "Score", "Duration", "Date", "Status"].map((h) => (
            <span key={h} className="text-[11px] font-semibold text-muted uppercase tracking-wide">{h}</span>
          ))}
        </div>

        {isLoading ? (
          [...Array(5)].map((_, i) => (
            <div key={i} className="px-5 py-4 border-b border-border last:border-b-0 flex items-center gap-4">
              <Skeleton className="w-8 h-5 shrink-0" />
              <div className="flex-1 space-y-1.5"><Skeleton className="h-4 w-36" /><Skeleton className="h-3 w-24" /></div>
              <Skeleton className="h-5 w-10 shrink-0" />
              <Skeleton className="h-4 w-16 shrink-0" />
            </div>
          ))
        ) : candidates.length === 0 ? (
          <EmptyCandidates />
        ) : (
          candidates.map((c, i) => {
            const rank   = String(i + 1).padStart(2, "0");
            const status = STATUS_CONFIG[c.status] ?? { label: c.status, color: "text-muted" };
            const date   = c.completed_at ? new Date(c.completed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "-";
            return (
              <Link key={c.id} href={`/candidates/${c.id}`}
                className="grid grid-cols-1 md:grid-cols-[64px_2fr_2fr_100px_72px_100px_100px] gap-4 px-5 py-4 border-b border-border last:border-b-0 hover:bg-[var(--bg)] transition-colors cursor-pointer items-center">
                {/* Decorative rank */}
                <span className="hidden md:block text-[28px] font-bold text-border leading-none select-none">{rank}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{c.candidate_name}</p>
                  <p className="text-[13px] text-muted truncate">{c.candidate_email}</p>
                </div>
                <p className="hidden md:block text-[13px] text-sub truncate">{c.job_title}</p>
                <div className="flex items-center"><ScoreBadge score={c.overall_score} size="sm" /></div>
                <span className="hidden md:block text-[13px] text-sub">{c.interview_duration_minutes !== null ? `${c.interview_duration_minutes}m` : "-"}</span>
                <span className="hidden md:block text-[13px] text-sub">{date}</span>
                <span className={`hidden md:block text-[13px] font-medium ${status.color}`}>{status.label}</span>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
