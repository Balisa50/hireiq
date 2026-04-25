"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Plus, Copy, Check, Users, BarChart2, ExternalLink,
  Briefcase, ChevronRight,
} from "lucide-react";
import { jobsAPI } from "@/lib/api";
import type { JobSummary } from "@/lib/types";
import Button from "@/components/ui/Button";

function JobCard({ job }: { job: JobSummary }) {
  const [copied, setCopied] = useState(false);

  const copyInterviewLink = useCallback(async () => {
    const link = jobsAPI.buildInterviewLink(job.interview_link_token);
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [job.interview_link_token]);

  const formattedDate = new Date(job.created_at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="glass rounded-2xl p-5 hover:border-white/15 transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 mb-1">
            <h3 className="text-base font-semibold text-white truncate">{job.title}</h3>
            <span
              className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                job.status === "active"
                  ? "bg-green-500/10 text-green-400 border border-green-500/20"
                  : "bg-white/5 text-[var(--text-dim)] border border-[var(--border)]"
              }`}
            >
              {job.status}
            </span>
          </div>
          {job.department && (
            <p className="text-sm text-[var(--text-muted)]">{job.department}</p>
          )}
          <p className="text-xs text-[var(--text-dim)] mt-1">Created {formattedDate}</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-5 mt-4 pt-4 border-t border-[var(--border)]">
        <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
          <Users className="w-3.5 h-3.5" />
          <span>{job.interview_count} interview{job.interview_count !== 1 ? "s" : ""}</span>
        </div>
        {job.average_score !== null && (
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <BarChart2 className="w-3.5 h-3.5" />
            <span>Avg. {job.average_score}/100</span>
          </div>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <Link href={`/jobs/${job.id}`}>
            <Button variant="secondary" size="sm">
              View Candidates <ChevronRight className="w-3 h-3" />
            </Button>
          </Link>
          <Button
            variant={copied ? "ghost" : "outline"}
            size="sm"
            onClick={copyInterviewLink}
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-green-400" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Copy Link
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    jobsAPI
      .listJobs()
      .then(setJobs)
      .catch(() => setError("Failed to load jobs. Please refresh."))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Jobs</h1>
          <p className="text-[var(--text-muted)] text-sm mt-1">
            Manage your open positions and interview links.
          </p>
        </div>
        <Link href="/jobs/new">
          <Button>
            <Plus className="w-4 h-4" /> Create New Job
          </Button>
        </Link>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="glass rounded-2xl p-5 h-32 animate-pulse" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="glass rounded-2xl py-20 text-center">
          <Briefcase className="w-12 h-12 text-[var(--text-dim)] mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-white mb-2">No jobs yet</h2>
          <p className="text-[var(--text-muted)] text-sm mb-6 max-w-sm mx-auto">
            Create your first job posting and HireIQ will generate intelligent interview questions
            automatically.
          </p>
          <Link href="/jobs/new">
            <Button>
              <Plus className="w-4 h-4" /> Create Your First Job
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}
