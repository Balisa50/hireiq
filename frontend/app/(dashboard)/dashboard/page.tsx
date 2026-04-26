"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Briefcase, Users, TrendingUp, Calendar,
  Plus, ArrowRight, Clock, CheckCircle2, XCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { companyAPI } from "@/lib/api";
import type { DashboardStats } from "@/lib/types";
import Button from "@/components/ui/Button";
import ScoreBadge from "@/components/ui/ScoreBadge";
import Skeleton from "@/components/ui/Skeleton";

// ── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon: Icon,
}: {
  label: string; value: string | number; icon: React.ElementType;
}) {
  return (
    <div className="bg-white border border-border rounded-[4px] p-5 flex items-center gap-4">
      <div className="w-10 h-10 rounded-[4px] bg-[var(--bg)] border border-border flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-sub" />
      </div>
      <div>
        <p className="text-2xl font-semibold text-ink leading-none">{value}</p>
        <p className="text-[13px] text-sub mt-1">{label}</p>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusLabel(status: string) {
  const map: Record<string, { label: string; icon: React.ElementType; color: string }> = {
    shortlisted: { label: "Shortlisted", icon: CheckCircle2, color: "text-success" },
    rejected:    { label: "Rejected",    icon: XCircle,      color: "text-danger" },
    scored:      { label: "Scored",      icon: CheckCircle2, color: "text-sub" },
    completed:   { label: "Completed",   icon: CheckCircle2, color: "text-sub" },
    in_progress: { label: "In Progress", icon: Clock,        color: "text-warn" },
  };
  return map[status] ?? { label: status, icon: Clock, color: "text-muted" };
}

function timeAgo(iso: string): string {
  const diff    = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)   return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { company } = useAuth();
  const [stats, setStats]         = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]         = useState("");

  useEffect(() => {
    let attempts = 0;
    function tryLoad() {
      attempts += 1;
      companyAPI.getDashboardStats()
        .then(setStats)
        .catch(() => {
          if (attempts < 3) {
            setTimeout(tryLoad, 1200 * attempts);
          } else {
            setError("Dashboard couldn't load. Please refresh.");
          }
        })
        .finally(() => setIsLoading(false));
    }
    tryLoad();
  }, []);

  // Determine if this is the user's very first session (no activity at all)
  const isFirstTime = !isLoading && stats !== null
    && stats.active_jobs === 0
    && stats.total_interviews === 0;

  const heading = isFirstTime
    ? `Welcome to HireIQ, ${company?.company_name ?? ""}!`
    : `Welcome back, ${company?.company_name ?? ""}`;

  const subtext = isFirstTime
    ? "Let's set up your first job posting and start hiring smarter."
    : "Here's what's happening with your hiring.";

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">{heading}</h1>
          <p className="text-sub text-sm mt-1">{subtext}</p>
        </div>
        {!isFirstTime && (
          <Link href="/jobs/new">
            <Button size="md">
              <Plus className="w-4 h-4" /> New Job
            </Button>
          </Link>
        )}
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="rounded-[4px] bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
          {error}
        </div>
      )}

      {/* ── Onboarding (first-time, zero jobs) ── */}
      {isFirstTime && (
        <div className="bg-white border border-border rounded-[4px] px-8 py-12 text-center">
          <div className="w-12 h-12 rounded-[4px] bg-[var(--bg)] border border-border flex items-center justify-center mx-auto mb-5">
            <Briefcase className="w-6 h-6 text-sub" />
          </div>
          <h2 className="text-base font-semibold text-ink mb-2">Create your first job</h2>
          <p className="text-sub text-sm max-w-sm mx-auto mb-6">
            Describe the role and HireIQ will generate tailored interview questions automatically.
            Then share a single link — candidates interview themselves.
          </p>
          <Link href="/jobs/new">
            <Button size="lg">
              <Plus className="w-4 h-4" /> Create a Job
            </Button>
          </Link>
        </div>
      )}

      {/* ── Stats grid (4-column) ── */}
      {!isFirstTime && (
        <>
          {isLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-white border border-border rounded-[4px] p-5 flex items-center gap-4">
                  <Skeleton className="w-10 h-10 rounded-[4px] shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-12" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : stats ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Active Jobs"      value={stats.active_jobs} icon={Briefcase} />
              <StatCard label="Total Interviews" value={stats.total_interviews} icon={Users} />
              <StatCard
                label="Average Score"
                value={stats.average_score !== null ? `${stats.average_score}/100` : "—"}
                icon={TrendingUp}
              />
              <StatCard label="This Week" value={stats.interviews_this_week} icon={Calendar} />
            </div>
          ) : null}

          {/* ── Recent activity ── */}
          <div className="bg-white border border-border rounded-[4px] overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-medium text-ink">Recent activity</h2>
              <Link
                href="/candidates"
                className="text-[13px] text-sub hover:text-ink flex items-center gap-1 transition-colors"
              >
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {isLoading ? (
              <div>
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="px-5 py-4 flex items-center gap-4 border-b border-border last:border-b-0">
                    <Skeleton className="w-7 h-7 rounded-full shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-5 w-10 shrink-0" />
                  </div>
                ))}
              </div>
            ) : !stats?.recent_activity?.length ? (
              <div className="px-5 py-14 text-center">
                <Users className="w-8 h-8 text-muted mx-auto mb-3" />
                <p className="text-sub text-sm">
                  No interviews yet. Share your job links to get started.
                </p>
              </div>
            ) : (
              <div>
                {stats.recent_activity.map((activity, idx) => {
                  const s    = statusLabel(activity.status);
                  const Icon = s.icon;
                  return (
                    <Link
                      key={idx}
                      href="/candidates"
                      className="px-5 py-3.5 flex items-center gap-4 border-b border-border last:border-b-0 hover:bg-[var(--bg)] transition-colors interactive-row"
                    >
                      <div className="w-7 h-7 rounded-full bg-[var(--bg)] border border-border flex items-center justify-center text-[11px] font-semibold text-sub shrink-0">
                        {activity.candidate_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ink truncate">{activity.candidate_name}</p>
                        <p className="text-[13px] text-sub truncate">{activity.job_title}</p>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        {activity.overall_score !== null && (
                          <ScoreBadge score={activity.overall_score} size="sm" />
                        )}
                        <Icon className={`w-4 h-4 ${s.color}`} />
                        <span className="text-[13px] text-muted">{timeAgo(activity.started_at)}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
