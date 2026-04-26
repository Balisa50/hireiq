"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Briefcase, Users, TrendingUp, Calendar, Plus, ArrowRight, Clock, CheckCircle2, XCircle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { companyAPI } from "@/lib/api";
import type { DashboardStats } from "@/lib/types";
import Button from "@/components/ui/Button";
import ScoreBadge from "@/components/ui/ScoreBadge";

function StatCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: React.ElementType }) {
  return (
    <div className="bg-white border border-border rounded-[4px] p-5 flex items-center gap-4">
      <div className="w-10 h-10 rounded-[4px] bg-canvas border border-border flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-sub" />
      </div>
      <div>
        <p className="text-2xl font-semibold text-ink leading-none">{value}</p>
        <p className="text-[13px] text-sub mt-1">{label}</p>
      </div>
    </div>
  );
}

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
  if (minutes < 60)  return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)    return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function DashboardPage() {
  const { company } = useAuth();
  const [stats, setStats]     = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]     = useState("");

  useEffect(() => {
    companyAPI.getDashboardStats()
      .then(setStats)
      .catch(() => setError("Failed to load dashboard. Please refresh."))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">Welcome back, {company?.company_name}</h1>
          <p className="text-sub text-sm mt-1">Here&apos;s what&apos;s happening with your hiring.</p>
        </div>
        <Link href="/jobs/new">
          <Button size="md">
            <Plus className="w-4 h-4" /> New Job
          </Button>
        </Link>
      </div>

      {error && (
        <div className="rounded-[4px] bg-red-50 border border-danger/20 px-4 py-3 text-sm text-danger">{error}</div>
      )}

      {/* Stats */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="bg-white border border-border rounded-[4px] p-5 h-20 animate-pulse" />)}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Active Jobs"       value={stats.active_jobs} icon={Briefcase} />
          <StatCard label="Total Interviews"  value={stats.total_interviews} icon={Users} />
          <StatCard label="Average Score"     value={stats.average_score !== null ? `${stats.average_score}/100` : "—"} icon={TrendingUp} />
          <StatCard label="This Week"         value={stats.interviews_this_week} icon={Calendar} />
        </div>
      ) : null}

      {/* Activity + Quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity */}
        <div className="lg:col-span-2 bg-white border border-border rounded-[4px] overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-medium text-ink">Recent activity</h2>
            <Link href="/candidates" className="text-[13px] text-sub hover:text-ink flex items-center gap-1 transition-colors">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {isLoading ? (
            <div className="p-5 space-y-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-9 bg-canvas rounded-[4px] animate-pulse" />)}
            </div>
          ) : !stats?.recent_activity?.length ? (
            <div className="px-5 py-14 text-center">
              <Users className="w-8 h-8 text-muted mx-auto mb-3" />
              <p className="text-sub text-sm">No interviews yet. Share your job links to get started.</p>
            </div>
          ) : (
            <div>
              {stats.recent_activity.map((activity, idx) => {
                const s = statusLabel(activity.status);
                const Icon = s.icon;
                return (
                  <div key={idx} className="px-5 py-3.5 flex items-center gap-4 border-b border-border last:border-b-0 hover:bg-canvas transition-colors">
                    <div className="w-7 h-7 rounded-full bg-canvas border border-border flex items-center justify-center text-[11px] font-semibold text-sub shrink-0">
                      {activity.candidate_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink truncate">{activity.candidate_name}</p>
                      <p className="text-[13px] text-sub truncate">{activity.job_title}</p>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      {activity.overall_score !== null && <ScoreBadge score={activity.overall_score} size="sm" />}
                      <Icon className={`w-4 h-4 ${s.color}`} />
                      <span className="text-[13px] text-muted">{timeAgo(activity.started_at)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="bg-white border border-border rounded-[4px] p-5 space-y-3 h-fit">
          <h2 className="text-sm font-medium text-ink mb-4">Quick actions</h2>
          <Link href="/jobs/new" className="flex items-center gap-3 p-3 rounded-[4px] border border-border hover:border-ink transition-colors">
            <div className="w-8 h-8 rounded-[4px] bg-canvas border border-border flex items-center justify-center">
              <Plus className="w-4 h-4 text-sub" />
            </div>
            <div>
              <p className="text-sm font-medium text-ink">Create new job</p>
              <p className="text-[13px] text-sub">Post + generate AI questions</p>
            </div>
          </Link>
          <Link href="/candidates" className="flex items-center gap-3 p-3 rounded-[4px] border border-border hover:border-ink transition-colors">
            <div className="w-8 h-8 rounded-[4px] bg-canvas border border-border flex items-center justify-center">
              <Users className="w-4 h-4 text-sub" />
            </div>
            <div>
              <p className="text-sm font-medium text-ink">View all candidates</p>
              <p className="text-[13px] text-sub">Ranked by AI score</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
