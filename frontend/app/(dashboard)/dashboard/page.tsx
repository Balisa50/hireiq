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

function StatCard({
  label, value, icon: Icon, color,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="glass rounded-2xl p-6 flex items-center gap-5">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-2xl font-bold text-white">{value}</p>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function statusLabel(status: string) {
  const map: Record<string, { label: string; icon: React.ElementType; color: string }> = {
    shortlisted: { label: "Shortlisted", icon: CheckCircle2, color: "text-green-400" },
    rejected: { label: "Rejected", icon: XCircle, color: "text-red-400" },
    scored: { label: "Scored", icon: CheckCircle2, color: "text-blue-400" },
    completed: { label: "Completed", icon: CheckCircle2, color: "text-emerald-400" },
    in_progress: { label: "In Progress", icon: Clock, color: "text-amber-400" },
  };
  return map[status] ?? { label: status, icon: Clock, color: "text-[var(--text-muted)]" };
}

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function DashboardPage() {
  const { company } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    companyAPI
      .getDashboardStats()
      .then(setStats)
      .catch(() => setError("Failed to load dashboard. Please refresh."))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Welcome back, {company?.company_name}
          </h1>
          <p className="text-[var(--text-muted)] mt-1">
            Here's what's happening with your hiring.
          </p>
        </div>
        <Link href="/jobs/new">
          <Button size="md">
            <Plus className="w-4 h-4" /> Create New Job
          </Button>
        </Link>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Stat cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="glass rounded-2xl p-6 h-24 animate-pulse" />
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Active Jobs"
            value={stats.active_jobs}
            icon={Briefcase}
            color="bg-brand-500/15 text-brand-400"
          />
          <StatCard
            label="Total Interviews"
            value={stats.total_interviews}
            icon={Users}
            color="bg-emerald-500/15 text-emerald-400"
          />
          <StatCard
            label="Average Score"
            value={stats.average_score !== null ? `${stats.average_score}/100` : "—"}
            icon={TrendingUp}
            color="bg-amber-500/15 text-amber-400"
          />
          <StatCard
            label="This Week"
            value={stats.interviews_this_week}
            icon={Calendar}
            color="bg-purple-500/15 text-purple-400"
          />
        </div>
      ) : null}

      {/* Recent Activity + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity feed */}
        <div className="lg:col-span-2 glass rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Recent Activity</h2>
            <Link
              href="/candidates"
              className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 transition-colors"
            >
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {isLoading ? (
            <div className="p-6 space-y-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-10 bg-white/5 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : !stats?.recent_activity?.length ? (
            <div className="px-6 py-12 text-center">
              <Users className="w-10 h-10 text-[var(--text-dim)] mx-auto mb-3" />
              <p className="text-[var(--text-muted)] text-sm">
                No interviews yet. Share your job links to get started.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {stats.recent_activity.map((activity, index) => {
                const status = statusLabel(activity.status);
                const StatusIcon = status.icon;
                return (
                  <div
                    key={index}
                    className="px-6 py-4 flex items-center gap-4 hover:bg-white/2 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center text-xs font-bold text-[var(--text-muted)] shrink-0">
                      {activity.candidate_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {activity.candidate_name}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] truncate">
                        {activity.job_title}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {activity.overall_score !== null && (
                        <ScoreBadge score={activity.overall_score} size="sm" />
                      )}
                      <StatusIcon className={`w-4 h-4 ${status.color}`} />
                      <span className="text-xs text-[var(--text-dim)]">
                        {timeAgo(activity.started_at)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="space-y-4">
          <div className="glass rounded-2xl p-6 space-y-3">
            <h2 className="text-sm font-semibold text-white mb-4">Quick Actions</h2>
            <Link href="/jobs/new" className="block">
              <div className="flex items-center gap-3 p-4 rounded-xl border border-brand-500/20 bg-brand-500/5 hover:bg-brand-500/10 transition-colors cursor-pointer">
                <div className="w-9 h-9 rounded-lg bg-brand-500/20 flex items-center justify-center">
                  <Plus className="w-5 h-5 text-brand-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Create New Job</p>
                  <p className="text-xs text-[var(--text-muted)]">Post + generate AI questions</p>
                </div>
              </div>
            </Link>
            <Link href="/candidates" className="block">
              <div className="flex items-center gap-3 p-4 rounded-xl border border-[var(--border)] hover:border-white/15 hover:bg-white/3 transition-colors cursor-pointer">
                <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center">
                  <Users className="w-5 h-5 text-[var(--text-muted)]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">View All Candidates</p>
                  <p className="text-xs text-[var(--text-muted)]">Ranked by AI score</p>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
