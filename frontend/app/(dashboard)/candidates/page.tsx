"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { Users, Filter, ChevronRight } from "lucide-react";
import { candidatesAPI, jobsAPI } from "@/lib/api";
import type { CandidateSummary, JobSummary } from "@/lib/types";
import ScoreBadge from "@/components/ui/ScoreBadge";
import Skeleton from "@/components/ui/Skeleton";

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "",            label: "All Statuses" },
  { value: "scored",      label: "Scored" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "rejected",    label: "Rejected" },
  { value: "in_progress", label: "In Progress" },
];

const STATUS_CONFIG: Record<string, { label: string; dot: string; text: string }> = {
  scored:      { label: "Scored",      dot: "bg-sub",     text: "text-sub" },
  shortlisted: { label: "Shortlisted", dot: "bg-success",  text: "text-success" },
  rejected:    { label: "Rejected",    dot: "bg-danger",   text: "text-danger" },
  completed:   { label: "Completed",   dot: "bg-sub",      text: "text-sub" },
  in_progress: { label: "In Progress", dot: "bg-warn",     text: "text-warn" },
};

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, dot: "bg-muted", text: "text-muted" };
  return (
    <span className={`inline-flex items-center gap-1.5 text-[13px] font-medium ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<CandidateSummary[]>([]);
  const [jobs, setJobs]             = useState<JobSummary[]>([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [error, setError]           = useState("");
  const [jobFilter, setJobFilter]   = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Silent retry — up to 3 attempts before showing the amber banner
  const attemptRef = useRef(0);

  const loadCandidates = useCallback(async () => {
    attemptRef.current = 0;
    setIsLoading(true);
    setError("");

    function tryLoad() {
      attemptRef.current += 1;
      candidatesAPI
        .listCandidates({ job_id: jobFilter || undefined, status: statusFilter || undefined })
        .then((data) => {
          setCandidates(data);
          setIsLoading(false);
        })
        .catch(() => {
          if (attemptRef.current < 3) {
            setTimeout(tryLoad, 900 * attemptRef.current);
          } else {
            setError("Couldn't load candidates. Please try refreshing.");
            setIsLoading(false);
          }
        });
    }

    tryLoad();
  }, [jobFilter, statusFilter]);

  useEffect(() => {
    jobsAPI.listJobs().then(setJobs).catch(() => null);
  }, []);

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-ink">Candidates</h1>
        <p className="text-sub text-sm mt-1">
          All candidates ranked by AI score. Click any row to view the full report.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Filter className="w-4 h-4 text-muted shrink-0" />

        <select
          value={jobFilter}
          onChange={(e) => setJobFilter(e.target.value)}
          className="bg-white border border-border rounded-[4px] px-3 py-2 text-[13px] text-ink outline-none focus:border-ink transition-colors cursor-pointer"
        >
          <option value="">All Jobs</option>
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>{job.title}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-white border border-border rounded-[4px] px-3 py-2 text-[13px] text-ink outline-none focus:border-ink transition-colors cursor-pointer"
        >
          {STATUS_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {/* Soft error banner */}
      {error && (
        <div className="rounded-[4px] bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700 flex items-center justify-between gap-4">
          <span>{error}</span>
          <button
            onClick={loadCandidates}
            className="text-sm font-medium text-amber-700 underline shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-border rounded-[4px] overflow-hidden">

        {/* Column headers */}
        <div className="hidden md:grid grid-cols-[32px_2fr_2fr_110px_80px_110px_1fr_32px] gap-4 px-5 py-3 bg-[var(--bg)] border-b border-border">
          {["#", "Candidate", "Role", "Score", "Duration", "Status", "Recommendation", ""].map((h, i) => (
            <span key={i} className="text-[11px] font-semibold text-muted uppercase tracking-wide truncate">
              {h}
            </span>
          ))}
        </div>

        {isLoading ? (
          <>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="px-5 py-4 border-b border-border last:border-b-0 flex items-center gap-4">
                <Skeleton className="w-6 h-3 shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-5 w-12 shrink-0" />
                <Skeleton className="h-5 w-20 shrink-0" />
              </div>
            ))}
          </>
        ) : candidates.length === 0 ? (
          <div className="py-20 text-center">
            <Users className="w-10 h-10 text-muted mx-auto mb-4" />
            <h2 className="text-base font-medium text-ink mb-2">No candidates yet</h2>
            <p className="text-sub text-sm max-w-sm mx-auto">
              Share your job interview links to start receiving candidates.
            </p>
          </div>
        ) : (
          candidates.map((candidate, index) => (
            <Link
              key={candidate.id}
              href={`/candidates/${candidate.id}`}
              className="grid grid-cols-1 md:grid-cols-[32px_2fr_2fr_110px_80px_110px_1fr_32px] gap-4 px-5 py-4 border-b border-border last:border-b-0 hover:bg-[var(--bg)] transition-colors items-center group interactive-row"
            >
              <span className="hidden md:block text-[13px] font-medium text-muted">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink truncate">{candidate.candidate_name}</p>
                <p className="text-[13px] text-muted truncate">{candidate.candidate_email}</p>
              </div>
              <p className="hidden md:block text-sm text-sub truncate">{candidate.job_title}</p>
              <div className="flex items-center">
                <ScoreBadge score={candidate.overall_score} size="sm" />
              </div>
              <span className="hidden md:block text-sm text-sub">
                {candidate.interview_duration_minutes !== null
                  ? `${candidate.interview_duration_minutes}m`
                  : "—"}
              </span>
              <div className="hidden md:flex items-center">
                <StatusBadge status={candidate.status} />
              </div>
              <span className="hidden md:block text-[13px] text-muted truncate">
                {candidate.hiring_recommendation ?? "—"}
              </span>
              <ChevronRight className="hidden md:block w-4 h-4 text-muted group-hover:text-ink transition-colors" />
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
