"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Plus, Copy, Check, ChevronRight, Briefcase } from "lucide-react";
import { jobsAPI } from "@/lib/api";
import type { JobSummary } from "@/lib/types";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

// ── Job row ───────────────────────────────────────────────────────────────────

function JobRow({ job }: { job: JobSummary }) {
  const [copied, setCopied] = useState(false);

  const copyLink = useCallback(async () => {
    const link = jobsAPI.buildInterviewLink(job.interview_link_token);
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [job.interview_link_token]);

  return (
    <div className="grid grid-cols-[1fr_auto] md:grid-cols-[2fr_80px_80px_100px_auto] items-center gap-4 px-5 py-4 border-b border-border last:border-b-0 hover:bg-[var(--bg)] transition-colors group">
      {/* Title + department */}
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink truncate">{job.title}</p>
        {job.department && (
          <p className="text-[13px] text-muted mt-0.5 truncate">{job.department}</p>
        )}
      </div>

      {/* Interviews — desktop only */}
      <p className="hidden md:block text-sm text-sub text-center">
        {job.interview_count}
      </p>

      {/* Avg score — desktop only */}
      <p className="hidden md:block text-sm text-sub text-center">
        {job.average_score !== null ? `${job.average_score}` : "—"}
      </p>

      {/* Status */}
      <div className="hidden md:flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
          job.status === "active" ? "bg-success" : "bg-border"
        }`} />
        <span className={`text-[13px] font-medium ${
          job.status === "active" ? "text-success" : "text-muted"
        }`}>
          {job.status === "active" ? "Active" : "Closed"}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0 justify-end">
        <button
          onClick={(e) => { e.preventDefault(); copyLink(); }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] text-sub hover:text-ink border border-border hover:border-sub rounded-[4px] transition-colors"
          title="Copy interview link"
        >
          {copied ? (
            <><Check className="w-3.5 h-3.5 text-success" /> Copied</>
          ) : (
            <><Copy className="w-3.5 h-3.5" /> Copy link</>
          )}
        </button>
        <Link
          href={`/jobs/${job.id}`}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-[13px] text-sub hover:text-ink border border-border hover:border-sub rounded-[4px] transition-colors"
        >
          View <ChevronRight className="w-3.5 h-3.5" />
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
        .catch(() => {
          if (attempts < 3) setTimeout(tryLoad, 1000 * attempts);
          else setError("Couldn't load jobs. Please refresh.");
        })
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
          <p className="text-sub text-sm mt-1">
            Manage your open positions and interview links.
          </p>
        </div>
        <Link href="/jobs/new">
          <Button>
            <Plus className="w-4 h-4" /> New Job
          </Button>
        </Link>
      </div>

      {error && (
        <div className="rounded-[4px] bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-border rounded-[4px] overflow-hidden">
        {/* Column headers */}
        <div className="hidden md:grid grid-cols-[2fr_80px_80px_100px_auto] gap-4 px-5 py-3 border-b border-border bg-[var(--bg)]">
          {["Position", "Interviews", "Avg. Score", "Status", ""].map((h, i) => (
            <span key={i} className="text-[11px] font-semibold text-muted uppercase tracking-wide">
              {h}
            </span>
          ))}
        </div>

        {isLoading ? (
          <>
            {[...Array(3)].map((_, i) => (
              <div key={i} className="px-5 py-4 border-b border-border last:border-b-0 flex items-center gap-4">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-7 w-20 shrink-0" />
                <Skeleton className="h-7 w-16 shrink-0" />
              </div>
            ))}
          </>
        ) : jobs.length === 0 ? (
          <div className="py-20 text-center">
            <Briefcase className="w-10 h-10 text-muted mx-auto mb-4" />
            <h2 className="text-base font-medium text-ink mb-2">No jobs yet</h2>
            <p className="text-sub text-sm mb-6 max-w-sm mx-auto">
              Create your first job posting and HireIQ will generate intelligent interview questions automatically.
            </p>
            <Link href="/jobs/new">
              <Button>
                <Plus className="w-4 h-4" /> Create your first job
              </Button>
            </Link>
          </div>
        ) : (
          jobs.map((job) => <JobRow key={job.id} job={job} />)
        )}
      </div>
    </div>
  );
}
