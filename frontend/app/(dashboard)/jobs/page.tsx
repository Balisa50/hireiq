"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Plus, Copy, Check, Users, BarChart2, Briefcase, ChevronRight } from "lucide-react";
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
    day: "numeric", month: "short", year: "numeric",
  });

  return (
    <div className="bg-white border border-border rounded-[4px] p-5 hover:border-sub transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 mb-1">
            <h3 className="text-base font-medium text-ink truncate">{job.title}</h3>
            <span className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-medium ${
              job.status === "active" ? "text-success" : "text-muted"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${job.status === "active" ? "bg-success" : "bg-border"}`} />
              {job.status === "active" ? "Active" : "Closed"}
            </span>
          </div>
          {job.department && <p className="text-[13px] text-sub">{job.department}</p>}
          <p className="text-[13px] text-muted mt-0.5">Created {formattedDate}</p>
        </div>
      </div>

      <div className="flex items-center gap-5 mt-4 pt-4 border-t border-border">
        <div className="flex items-center gap-1.5 text-[13px] text-sub">
          <Users className="w-3.5 h-3.5" />
          {job.interview_count} interview{job.interview_count !== 1 ? "s" : ""}
        </div>
        {job.average_score !== null && (
          <div className="flex items-center gap-1.5 text-[13px] text-sub">
            <BarChart2 className="w-3.5 h-3.5" />
            Avg. {job.average_score}/100
          </div>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <Link href={`/jobs/${job.id}`}>
            <Button variant="secondary" size="sm">
              Candidates <ChevronRight className="w-3 h-3" />
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={copyInterviewLink}>
            {copied ? (
              <><Check className="w-3.5 h-3.5 text-success" /> Copied</>
            ) : (
              <><Copy className="w-3.5 h-3.5" /> Copy link</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function JobsPage() {
  const [jobs, setJobs]           = useState<JobSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]         = useState("");

  useEffect(() => {
    jobsAPI.listJobs()
      .then(setJobs)
      .catch(() => setError("Failed to load jobs. Please refresh."))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
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
        <div className="rounded-[4px] bg-red-50 border border-danger/20 px-4 py-3 text-sm text-danger">{error}</div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="bg-white border border-border rounded-[4px] p-5 h-28 animate-pulse" />)}
        </div>
      ) : jobs.length === 0 ? (
        <div className="bg-white border border-border rounded-[4px] py-20 text-center">
          <Briefcase className="w-10 h-10 text-muted mx-auto mb-4" />
          <h2 className="text-base font-medium text-ink mb-2">No jobs yet</h2>
          <p className="text-sub text-sm mb-6 max-w-sm mx-auto">
            Create your first job posting and HireIQ will generate intelligent interview questions automatically.
          </p>
          <Link href="/jobs/new">
            <Button><Plus className="w-4 h-4" /> Create your first job</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => <JobCard key={job.id} job={job} />)}
        </div>
      )}
    </div>
  );
}
