"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Users, Filter, ChevronRight } from "lucide-react";
import { candidatesAPI, jobsAPI } from "@/lib/api";
import type { CandidateSummary, JobSummary } from "@/lib/types";
import ScoreBadge from "@/components/ui/ScoreBadge";
import Button from "@/components/ui/Button";

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "scored", label: "Scored" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "rejected", label: "Rejected" },
  { value: "in_progress", label: "In Progress" },
];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  scored:      { label: "Scored",      color: "text-blue-400 bg-blue-400/10 border-blue-400/20" },
  shortlisted: { label: "Shortlisted", color: "text-green-400 bg-green-400/10 border-green-400/20" },
  rejected:    { label: "Rejected",    color: "text-red-400 bg-red-400/10 border-red-400/20" },
  completed:   { label: "Completed",   color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
  in_progress: { label: "In Progress", color: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_LABELS[status] ?? { label: status, color: "text-[var(--text-muted)] bg-white/5 border-[var(--border)]" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${config.color}`}>
      {config.label}
    </span>
  );
}

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<CandidateSummary[]>([]);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [jobFilter, setJobFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [rank, setRank] = useState(1);

  const loadCandidates = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const data = await candidatesAPI.listCandidates({
        job_id: jobFilter || undefined,
        status: statusFilter || undefined,
      });
      setCandidates(data);
    } catch {
      setError("Failed to load candidates. Please refresh.");
    } finally {
      setIsLoading(false);
    }
  }, [jobFilter, statusFilter]);

  useEffect(() => {
    jobsAPI.listJobs().then(setJobs).catch(() => null);
  }, []);

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Candidates</h1>
        <p className="text-[var(--text-muted)] text-sm mt-1">
          All candidates ranked by AI score. Click any row to see the full report.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Filter className="w-4 h-4 text-[var(--text-dim)]" />
        <select
          value={jobFilter}
          onChange={(e) => setJobFilter(e.target.value)}
          className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-brand-500 transition-colors"
        >
          <option value="">All Jobs</option>
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.title}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-brand-500 transition-colors"
        >
          {STATUS_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="glass rounded-2xl overflow-hidden">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="h-16 border-b border-[var(--border)] bg-white/2 animate-pulse"
            />
          ))}
        </div>
      ) : candidates.length === 0 ? (
        <div className="glass rounded-2xl py-20 text-center">
          <Users className="w-12 h-12 text-[var(--text-dim)] mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-white mb-2">No candidates yet</h2>
          <p className="text-[var(--text-muted)] text-sm">
            Share your job interview links to start receiving candidates.
          </p>
        </div>
      ) : (
        <div className="glass rounded-2xl overflow-hidden">
          {/* Table header */}
          <div className="hidden md:grid grid-cols-[40px_2fr_2fr_120px_100px_120px_120px_40px] gap-4 px-5 py-3 border-b border-[var(--border)] text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wide">
            <span>#</span>
            <span>Candidate</span>
            <span>Role Applied</span>
            <span>Score</span>
            <span>Duration</span>
            <span>Status</span>
            <span>Recommendation</span>
            <span />
          </div>

          {/* Rows */}
          {candidates.map((candidate, index) => (
            <Link
              key={candidate.id}
              href={`/candidates/${candidate.id}`}
              className="grid grid-cols-1 md:grid-cols-[40px_2fr_2fr_120px_100px_120px_120px_40px] gap-4 px-5 py-4 border-b border-[var(--border)] hover:bg-white/2 transition-colors items-center group"
            >
              <span className="text-sm font-bold text-[var(--text-dim)]">
                {index + 1}
              </span>
              <div>
                <p className="text-sm font-semibold text-white">{candidate.candidate_name}</p>
                <p className="text-xs text-[var(--text-muted)]">{candidate.candidate_email}</p>
              </div>
              <p className="text-sm text-[var(--text-muted)] truncate">{candidate.job_title}</p>
              <ScoreBadge score={candidate.overall_score} size="sm" />
              <span className="text-sm text-[var(--text-muted)]">
                {candidate.interview_duration_minutes !== null
                  ? `${candidate.interview_duration_minutes}m`
                  : "—"}
              </span>
              <StatusBadge status={candidate.status} />
              <span className="text-xs text-[var(--text-muted)] truncate">
                {candidate.hiring_recommendation ?? "—"}
              </span>
              <ChevronRight className="w-4 h-4 text-[var(--text-dim)] group-hover:text-brand-400 transition-colors" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
