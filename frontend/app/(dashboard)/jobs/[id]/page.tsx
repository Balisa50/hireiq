"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Copy, Check, Power, PowerOff,
  Users, BarChart3, Calendar, Briefcase,
  MapPin, Clock, ExternalLink, ChevronRight,
  AlertCircle, Loader2, Trash2, PauseCircle, PlayCircle,
} from "lucide-react";
import { jobsAPI, candidatesAPI } from "@/lib/api";
import type { Job, CandidateSummary } from "@/lib/types";
import Button from "@/components/ui/Button";
import ScoreBadge from "@/components/ui/ScoreBadge";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  scored:        { label: "Scored",        color: "text-blue-700 bg-blue-50 border-blue-200" },
  shortlisted:   { label: "Shortlisted",   color: "text-green-700 bg-green-50 border-green-200" },
  accepted:      { label: "Accepted",      color: "text-sky-700 bg-sky-50 border-sky-200" },
  rejected:      { label: "Rejected",      color: "text-red-700 bg-red-50 border-red-200" },
  auto_rejected: { label: "Auto-Rejected", color: "text-red-700 bg-red-50 border-red-200" },
  completed:     { label: "Completed",     color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  in_progress:   { label: "In Progress",   color: "text-amber-700 bg-amber-50 border-amber-200" },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_LABELS[status] ?? {
    label: status,
    color: "text-muted bg-[var(--bg)] border-border",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${config.color}`}>
      {config.label}
    </span>
  );
}

const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  full_time:  "Full Time",
  part_time:  "Part Time",
  contract:   "Contract",
  internship: "Internship",
};

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();

  const [job, setJob]               = useState<Job | null>(null);
  const [candidates, setCandidates] = useState<CandidateSummary[]>([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [error, setError]           = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeletingJob, setIsDeletingJob] = useState(false);
  const [isTogglingPause, setIsTogglingPause] = useState(false);
  const [deadline, setDeadline] = useState("");
  const [appLimit, setAppLimit] = useState(0);
  const [controlsSaved, setControlsSaved] = useState(false);

  useEffect(() => {
    Promise.all([
      jobsAPI.getJob(id),
      candidatesAPI.listCandidates({ job_id: id }),
    ])
      .then(([jobData, candidatesData]) => {
        setJob(jobData);
        setCandidates(candidatesData);
        setDeadline(jobData.application_deadline ?? "");
        setAppLimit(jobData.application_limit ?? 0);
      })
      .catch(() => setError("Failed to load job details."))
      .finally(() => setIsLoading(false));
  }, [id]);

  const copyLink = useCallback(async () => {
    if (!job) return;
    const link = jobsAPI.buildInterviewLink(job.interview_link_token);
    await navigator.clipboard.writeText(link);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }, [job]);

  const togglePause = useCallback(async () => {
    if (!job) return;
    const newPaused = !job.is_paused;
    setIsTogglingPause(true);
    try {
      await jobsAPI.updateJobControls(job.id, { is_paused: newPaused });
      setJob((prev) => prev ? { ...prev, is_paused: newPaused } : prev);
    } catch {
      alert("Failed to update job. Please try again.");
    } finally {
      setIsTogglingPause(false);
    }
  }, [job]);

  const saveControls = useCallback(async () => {
    if (!job) return;
    try {
      await jobsAPI.updateJobControls(job.id, {
        application_deadline: deadline || null,
        application_limit: appLimit,
      });
      setJob((prev) => prev ? {
        ...prev,
        application_deadline: deadline || null,
        application_limit: appLimit,
      } : prev);
      setControlsSaved(true);
      setTimeout(() => setControlsSaved(false), 2000);
    } catch {
      alert("Failed to save controls. Please try again.");
    }
  }, [job, deadline, appLimit]);

  const deleteJob = useCallback(async () => {
    if (!job) return;
    setIsDeletingJob(true);
    try {
      await jobsAPI.deleteJob(job.id);
      router.replace("/jobs");
    } catch {
      alert("Failed to delete job. Please try again.");
      setIsDeletingJob(false);
    }
  }, [job, router]);

  const toggleJobStatus = useCallback(async () => {
    if (!job) return;
    const newStatus = job.status === "active" ? "closed" : "active";
    setIsTogglingStatus(true);
    try {
      await jobsAPI.updateJobStatus(job.id, newStatus);
      setJob((prev) => (prev ? { ...prev, status: newStatus } : prev));
    } catch {
      alert("Failed to update job status. Please try again.");
    } finally {
      setIsTogglingStatus(false);
    }
  }, [job]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-ink" />
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center">
        <AlertCircle className="w-10 h-10 text-danger mx-auto mb-4" />
        <p className="text-danger">{error || "Job not found."}</p>
        <Button variant="ghost" className="mt-4" onClick={() => router.back()}>
          Go Back
        </Button>
      </div>
    );
  }

  const interviewLink = jobsAPI.buildInterviewLink(job.interview_link_token);
  const isActive      = job.status === "active";
  const isPaused      = isActive && job.is_paused;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Back + actions */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-sub hover:text-ink transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Jobs
        </button>

        <div className="flex items-center gap-2 flex-wrap">
          {isActive && (
            <Button variant="secondary" size="sm" onClick={copyLink}>
              {linkCopied ? (
                <><Check className="w-3.5 h-3.5 text-green-600" /> Copied!</>
              ) : (
                <><Copy className="w-3.5 h-3.5" /> Copy Application Link</>
              )}
            </Button>
          )}
          {isActive && (
            <Button
              variant="secondary"
              size="sm"
              isLoading={isTogglingPause}
              onClick={togglePause}
            >
              {job.is_paused ? (
                <><PlayCircle className="w-3.5 h-3.5" /> Resume</>
              ) : (
                <><PauseCircle className="w-3.5 h-3.5" /> Pause</>
              )}
            </Button>
          )}
          <Button
            variant={isActive ? "danger" : "secondary"}
            size="sm"
            isLoading={isTogglingStatus}
            onClick={toggleJobStatus}
          >
            {isActive ? (
              <><PowerOff className="w-3.5 h-3.5" /> Close Job</>
            ) : (
              <><Power className="w-3.5 h-3.5" /> Reopen Job</>
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDeleteModal(true)}
            className="text-muted hover:text-danger"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Header */}
      <div className="bg-white border border-border rounded-[4px] p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${
                  isPaused
                    ? "text-amber-700 bg-amber-50 border-amber-200"
                    : isActive
                    ? "text-green-700 bg-green-50 border-green-200"
                    : "text-muted bg-[var(--bg)] border-border"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isPaused ? "bg-amber-500" : isActive ? "bg-green-500 animate-pulse" : "bg-muted"}`} />
                {isPaused ? "Paused" : isActive ? "Active" : "Closed"}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-ink">{job.title}</h1>
            <div className="flex flex-wrap items-center gap-4 mt-2">
              {job.department && (
                <span className="flex items-center gap-1.5 text-sm text-sub">
                  <Briefcase className="w-3.5 h-3.5" />
                  {job.department}
                </span>
              )}
              {job.location && (
                <span className="flex items-center gap-1.5 text-sm text-sub">
                  <MapPin className="w-3.5 h-3.5" />
                  {job.location}
                </span>
              )}
              {job.employment_type && (
                <span className="flex items-center gap-1.5 text-sm text-sub">
                  <Clock className="w-3.5 h-3.5" />
                  {EMPLOYMENT_TYPE_LABELS[job.employment_type] ?? job.employment_type}
                </span>
              )}
              <span className="flex items-center gap-1.5 text-sm text-sub">
                <Calendar className="w-3.5 h-3.5" />
                Posted{" "}
                {new Date(job.created_at).toLocaleDateString("en-GB", {
                  day: "numeric", month: "short", year: "numeric",
                })}
              </span>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-5 border-t border-border">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-muted mb-1">
              <Users className="w-3.5 h-3.5" /> Total Candidates
            </div>
            <p className="text-2xl font-bold text-ink">{job.interview_count}</p>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-xs text-muted mb-1">
              <BarChart3 className="w-3.5 h-3.5" /> Average Score
            </div>
            <p className="text-2xl font-bold text-ink">
              {job.average_score !== null ? `${job.average_score}` : "-"}
              {job.average_score !== null && (
                <span className="text-sm font-normal text-sub">/100</span>
              )}
            </p>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-xs text-muted mb-1">
              Questions
            </div>
            <p className="text-2xl font-bold text-ink">{job.question_count}</p>
          </div>
        </div>
      </div>

      {/* Job controls */}
      {isActive && (
        <div className="bg-white border border-border rounded-[4px] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-muted uppercase tracking-wider">
              Application Controls
            </h2>
            {controlsSaved && (
              <span className="text-[11px] text-green-700 flex items-center gap-1">
                <Check className="w-3 h-3" /> Saved
              </span>
            )}
          </div>

          {job.is_paused && (
            <div className="flex items-center gap-2 text-amber-700 text-xs bg-amber-50 border border-amber-200 rounded-[4px] px-3 py-2">
              <PauseCircle className="w-3.5 h-3.5 shrink-0" />
              Applications are paused — new candidates cannot start.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-sub">
                Application deadline
              </label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full bg-[var(--bg)] border border-border rounded-[4px] px-3 py-2 text-sm text-ink outline-none focus:border-ink transition-colors"
              />
              <p className="text-[10px] text-muted">
                Job auto-closes after this date. Leave blank for no deadline.
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-sub">
                Application limit
              </label>
              <input
                type="number"
                min={0}
                max={10000}
                value={appLimit}
                onChange={(e) => setAppLimit(Number(e.target.value))}
                className="w-full bg-[var(--bg)] border border-border rounded-[4px] px-3 py-2 text-sm text-ink outline-none focus:border-ink transition-colors"
              />
              <p className="text-[10px] text-muted">
                Max applications before auto-closing. 0 = unlimited.
              </p>
            </div>
          </div>

          <Button variant="secondary" size="sm" onClick={saveControls}>
            <Check className="w-3.5 h-3.5" /> Save Controls
          </Button>
        </div>
      )}

      {/* Interview link */}
      {isActive && (
        <div className="bg-white border border-border rounded-[4px] p-5">
          <h2 className="text-xs font-bold text-muted uppercase tracking-wider mb-3">
            Application Link
          </h2>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-0 bg-[var(--bg)] border border-border rounded-[4px] px-4 py-2.5 font-mono text-sm text-sub truncate">
              {interviewLink}
            </div>
            <Button variant="secondary" size="sm" onClick={copyLink}>
              {linkCopied ? (
                <><Check className="w-3.5 h-3.5 text-green-600" /> Copied!</>
              ) : (
                <><Copy className="w-3.5 h-3.5" /> Copy</>
              )}
            </Button>
            <a
              href={interviewLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-sub hover:text-ink transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Preview
            </a>
          </div>
        </div>
      )}

      {/* Focus areas */}
      {job.focus_areas.length > 0 && (
        <div className="bg-white border border-border rounded-[4px] p-5">
          <h2 className="text-xs font-bold text-muted uppercase tracking-wider mb-3">
            Application Focus Areas
          </h2>
          <div className="flex flex-wrap gap-2">
            {job.focus_areas.map((area) => (
              <span
                key={area}
                className="px-3 py-1.5 rounded-[4px] text-xs font-medium bg-[var(--bg)] border border-border text-sub"
              >
                {area}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Interview questions */}
      {job.questions.length > 0 && (
        <div className="bg-white border border-border rounded-[4px] p-5">
          <h2 className="text-xs font-bold text-muted uppercase tracking-wider mb-4">
            Application Questions ({job.questions.length})
          </h2>
          <div className="space-y-3">
            {job.questions.map((q, i) => (
              <div
                key={q.id}
                className="flex items-start gap-3 rounded-[4px] bg-[var(--bg)] border border-border px-4 py-3"
              >
                <span className="w-6 h-6 rounded-full bg-border text-sub text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink">{q.question}</p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-[10px] text-muted bg-white border border-border px-2 py-0.5 rounded-full">
                      {q.type}
                    </span>
                    <span className="text-[10px] text-muted">{q.focus_area}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delete job confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/30 backdrop-blur-sm">
          <div className="bg-white border border-border rounded-[4px] w-full max-w-md shadow-xl">
            <div className="p-6 space-y-3">
              <h2 className="text-base font-semibold text-ink">Delete this job?</h2>
              <p className="text-sm text-sub">
                <span className="font-medium text-ink">{job.title}</span> and all{" "}
                <span className="font-medium text-ink">{candidates.length}</span> candidate
                {candidates.length !== 1 ? "s" : ""} will be permanently deleted. This cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 text-sm font-medium text-sub hover:text-ink transition-colors"
              >
                Cancel
              </button>
              <Button
                variant="danger"
                size="sm"
                onClick={deleteJob}
                isLoading={isDeletingJob}
                loadingText="Deleting…"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete job
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Candidates */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-ink">
            Candidates{" "}
            <span className="text-muted font-normal text-sm">({candidates.length})</span>
          </h2>
          {candidates.length > 0 && (
            <Link
              href={`/candidates?job=${id}`}
              className="text-xs text-sub hover:text-ink transition-colors"
            >
              View all →
            </Link>
          )}
        </div>

        {candidates.length === 0 ? (
          <div className="bg-white border border-border rounded-[4px] py-14 text-center">
            <Users className="w-10 h-10 text-muted mx-auto mb-3" />
            <h3 className="text-base font-semibold text-ink mb-1">No candidates yet</h3>
            <p className="text-sub text-sm">
              Share the application link to start receiving applicants.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-border rounded-[4px] overflow-hidden">
            <div className="hidden md:grid grid-cols-[2fr_120px_100px_120px_120px_24px] gap-4 px-5 py-3 border-b border-border text-xs font-semibold text-muted uppercase tracking-wide">
              <span>Candidate</span>
              <span>Score</span>
              <span>Duration</span>
              <span>Status</span>
              <span>Recommendation</span>
              <span />
            </div>
            {candidates.map((c) => (
              <Link
                key={c.id}
                href={`/candidates/${c.id}`}
                className="grid grid-cols-1 md:grid-cols-[2fr_120px_100px_120px_120px_24px] gap-4 px-5 py-4 border-b border-border hover:bg-[var(--bg)] transition-colors items-center group"
              >
                <div>
                  <p className="text-sm font-semibold text-ink">{c.candidate_name}</p>
                  <p className="text-xs text-sub">{c.candidate_email}</p>
                </div>
                <ScoreBadge score={c.overall_score} size="sm" />
                <span className="text-sm text-sub">
                  {c.interview_duration_minutes !== null
                    ? `${c.interview_duration_minutes}m`
                    : "-"}
                </span>
                <StatusBadge status={c.status} />
                <span className="text-xs text-sub truncate">
                  {c.hiring_recommendation ?? "-"}
                </span>
                <ChevronRight className="w-4 h-4 text-muted group-hover:text-ink transition-colors" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
