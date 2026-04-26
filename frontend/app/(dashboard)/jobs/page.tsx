"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Plus, Copy, Check } from "lucide-react";
import { jobsAPI } from "@/lib/api";
import type { JobSummary } from "@/lib/types";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";

// ── Empty state SVG ────────────────────────────────────────────────────────────

function EmptyJobs() {
  return (
    <div className="py-20 text-center">
      <svg className="w-16 h-16 mx-auto mb-5 text-border" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="8" y="12" width="48" height="40" rx="3" />
        <line x1="18" y1="24" x2="46" y2="24" />
        <line x1="18" y1="32" x2="46" y2="32" />
        <line x1="18" y1="40" x2="34" y2="40" />
      </svg>
      <h2 className="text-base font-medium text-ink mb-2">No jobs posted yet</h2>
      <p className="text-sub text-sm mb-6 max-w-xs mx-auto">
        Post a role and HireIQ will handle the screening.
      </p>
      <Link href="/jobs/new">
        <Button><Plus className="w-4 h-4" /> Post a Job</Button>
      </Link>
    </div>
  );
}

// ── Job row ────────────────────────────────────────────────────────────────────

function JobRow({ job }: { job: JobSummary }) {
  const [copied, setCopied] = useState(false);

  const copyLink = useCallback(async () => {
    await navigator.clipboard.writeText(jobsAPI.buildInterviewLink(job.interview_link_token));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [job.interview_link_token]);

  return (
    <div className="grid grid-cols-[2fr_1fr_80px_80px_100px_120px] items-center gap-4 px-5 py-3.5 border-b border-border last:border-b-0 hover:bg-[var(--bg)] transition-colors cursor-pointer group min-w-[640px]">
      {/* Position */}
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink truncate">{job.title}</p>
        {job.department && <p className="text-[13px] text-muted truncate">{job.department}</p>}
      </div>

      {/* Department (hidden on small) */}
      <p className="text-[13px] text-sub truncate hidden sm:block">{job.department ?? "-"}</p>

      {/* Candidates */}
      <p className="text-[13px] text-sub text-center">{job.interview_count}</p>

      {/* Avg score */}
      <div className="flex items-center justify-center gap-1.5">
        {job.average_score !== null ? (
          <>
            <span className={`w-2 h-2 rounded-full shrink-0 ${job.average_score >= 70 ? "bg-success" : job.average_score >= 50 ? "bg-warn" : "bg-danger"}`} />
            <span className="text-[13px] text-sub">{job.average_score}</span>
          </>
        ) : (
          <span className="text-[13px] text-muted">-</span>
        )}
      </div>

      {/* Status */}
      <span className={`text-[13px] font-medium ${job.status === "active" ? "text-success" : "text-muted"}`}>
        {job.status === "active" ? "Active" : "Closed"}
      </span>

      {/* Actions */}
      <div className="flex items-center gap-3 justify-end">
        <button
          onClick={(e) => { e.stopPropagation(); copyLink(); }}
          className="text-[13px] text-sub hover:text-ink transition-colors flex items-center gap-1"
        >
          {copied ? <><Check className="w-3.5 h-3.5 text-success" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy Link</>}
        </button>
        <Link href={`/jobs/${job.id}`} className="text-[13px] text-sub hover:text-ink transition-colors">
          View
        </Link>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function JobsPage() {
  const [jobs, setJobs]           = useState<JobSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]         = useState("");

  useEffect(() => {
    let attempts = 0;
    function tryLoad() {
      attempts += 1;
      jobsAPI.listJobs()
        .then(setJobs)
        .catch(() => { if (attempts < 3) setTimeout(tryLoad, 1000); else setError("Couldn't load jobs. Please refresh."); })
        .finally(() => setIsLoading(false));
    }
    tryLoad();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Jobs</h1>
          <p className="text-sub text-sm mt-1">Manage your open positions and interview links.</p>
        </div>
        <Link href="/jobs/new">
          <Button><Plus className="w-4 h-4" /> New Job</Button>
        </Link>
      </div>

      {error && (
        <div className="rounded-[4px] bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">{error}</div>
      )}

      <div className="bg-white border border-border rounded-[4px] overflow-hidden">
        <div className="overflow-x-auto">
        {/* Table header */}
        <div className="grid grid-cols-[2fr_1fr_80px_80px_100px_120px] gap-4 px-5 py-3 bg-[var(--bg)] border-b border-border min-w-[640px]">
          {["Position", "Department", "Candidates", "Avg Score", "Status", ""].map((h, i) => (
            <span key={i} className="text-[11px] font-semibold text-muted uppercase tracking-wide">{h}</span>
          ))}
        </div>

        {isLoading ? (
          <>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="px-5 py-4 border-b border-border last:border-b-0 flex items-center gap-4">
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-4 w-8 shrink-0" />
                <Skeleton className="h-4 w-8 shrink-0" />
                <Skeleton className="h-4 w-12 shrink-0" />
              </div>
            ))}
          </>
        ) : jobs.length === 0 ? (
          <EmptyJobs />
        ) : (
          jobs.map((job) => <JobRow key={job.id} job={job} />)
        )}
        </div>{/* /overflow-x-auto */}
      </div>
    </div>
  );
}
