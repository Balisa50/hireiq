"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Briefcase, Users, TrendingUp, Calendar, Plus, CheckCircle2, XCircle, Clock } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { companyAPI } from "@/lib/api";
import type { DashboardStats } from "@/lib/types";
import Button from "@/components/ui/Button";
import ScoreBadge from "@/components/ui/ScoreBadge";
import Skeleton from "@/components/ui/Skeleton";

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff    = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 2)   return "Just now";
  if (minutes < 60)  return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)    return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1)    return "Yesterday";
  return `${days}d ago`;
}

function statusConfig(status: string) {
  const map: Record<string, { icon: React.ElementType; color: string }> = {
    shortlisted: { icon: CheckCircle2, color: "text-success" },
    rejected:    { icon: XCircle,      color: "text-danger" },
    scored:      { icon: CheckCircle2, color: "text-sub" },
    completed:   { icon: CheckCircle2, color: "text-sub" },
    in_progress: { icon: Clock,        color: "text-warn" },
  };
  return map[status] ?? { icon: Clock, color: "text-muted" };
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: React.ElementType }) {
  return (
    <div className="bg-white border border-border rounded-[4px] p-5">
      <div className="flex items-center gap-3 mb-3">
        <Icon className="w-4 h-4 text-muted" />
        <span className="text-[13px] text-sub">{label}</span>
      </div>
      <p className="text-[32px] font-bold text-ink leading-none">{value}</p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { company }            = useAuth();
  const [stats, setStats]      = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]      = useState("");

  useEffect(() => {
    let attempts = 0;
    function tryLoad() {
      attempts += 1;
      companyAPI.getDashboardStats()
        .then(setStats)
        .catch(() => {
          if (attempts < 3) setTimeout(tryLoad, 1200 * attempts);
          else setError("Dashboard couldn't load. Please refresh.");
        })
        .finally(() => setIsLoading(false));
    }
    tryLoad();
  }, []);

  const isFirstTime = !isLoading && stats !== null && stats.active_jobs === 0 && stats.total_interviews === 0;

  // ── Always render the full dashboard layout ────────────────────────────────
  return (
    <div className="space-y-8">
      {/* Header — context-aware, never a separate full-screen state */}
      <div className="flex items-start justify-between gap-4">
        <div>
          {isFirstTime ? (
            <>
              <h1 className="text-xl font-semibold text-ink">
                Welcome to HireIQ, {company?.company_name}.
              </h1>
              <p className="text-sub text-sm mt-1">Your hiring dashboard is ready.</p>
              <Link
                href="/jobs/new"
                className="inline-flex items-center gap-1 text-[13px] text-sub hover:text-ink transition-colors mt-2"
              >
                <Plus className="w-3.5 h-3.5" /> Create your first job →
              </Link>
            </>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-ink">
                Welcome back, {company?.company_name}
              </h1>
              <p className="text-sub text-sm mt-1">Here&apos;s what&apos;s happening with your hiring.</p>
            </>
          )}
        </div>
        {!isFirstTime && (
          <Link href="/jobs/new">
            <Button size="sm"><Plus className="w-4 h-4" /> New Job</Button>
          </Link>
        )}
      </div>

      {error && (
        <div className="rounded-[4px] bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
          {error}
        </div>
      )}

      {/* Stats */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white border border-border rounded-[4px] p-5 space-y-3">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-12" />
            </div>
          ))}
        </div>
      ) : stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Active Jobs"      value={stats.active_jobs}       icon={Briefcase} />
          <StatCard label="Total Interviews" value={stats.total_interviews}   icon={Users} />
          <StatCard label="Average Score"    value={stats.average_score !== null ? `${stats.average_score}/100` : "—"} icon={TrendingUp} />
          <StatCard label="This Week"        value={stats.interviews_this_week} icon={Calendar} />
        </div>
      )}

      {/* Recent activity */}
      <div className="bg-white border border-border rounded-[4px] overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-medium text-ink">Recent activity</h2>
          <Link href="/candidates" className="text-[13px] text-sub hover:text-ink transition-colors">
            View all →
          </Link>
        </div>

        {isLoading ? (
          <>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="px-5 py-4 flex items-center gap-4 border-b border-border last:border-b-0">
                <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-3 w-14 shrink-0" />
              </div>
            ))}
          </>
        ) : !stats?.recent_activity?.length ? (
          <div className="px-5 py-14 text-center">
            <Users className="w-8 h-8 text-muted mx-auto mb-3" />
            <p className="text-sub text-sm">No interviews yet.</p>
            <Link href="/jobs" className="text-[13px] text-ink underline underline-offset-2 mt-2 inline-block">
              Go to Jobs →
            </Link>
          </div>
        ) : (
          stats.recent_activity.map((a, i) => {
            const s    = statusConfig(a.status);
            const Icon = s.icon;
            const initials = a.candidate_name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
            return (
              <Link
                key={i}
                href="/candidates"
                className="px-5 py-3.5 flex items-center gap-4 border-b border-border last:border-b-0 hover:bg-[var(--bg)] transition-colors cursor-pointer"
              >
                <div className="w-8 h-8 rounded-full bg-[var(--bg)] border border-border flex items-center justify-center text-[11px] font-semibold text-sub shrink-0">
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink truncate">
                    <span className="font-medium">{a.candidate_name}</span>
                    {" completed interview for "}
                    <span className="font-medium">{a.job_title}</span>
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {a.overall_score !== null && <ScoreBadge score={a.overall_score} size="sm" />}
                  <Icon className={`w-4 h-4 ${s.color}`} />
                  <span className="text-[12px] text-muted">{timeAgo(a.started_at)}</span>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
