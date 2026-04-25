"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Briefcase,
  Users,
  Settings,
  LogOut,
  ChevronDown,
  Zap,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { clsx } from "clsx";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/candidates", label: "Candidates", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export default function DashboardNav() {
  const pathname = usePathname();
  const { company, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--border)] bg-[var(--bg-card)]/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-8">
          {/* Brand */}
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-brand-400 font-bold text-xl tracking-tight shrink-0 hover:text-brand-300 transition-colors"
          >
            <Zap className="w-5 h-5" />
            HireIQ
          </Link>

          {/* Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  className={clsx(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "text-brand-400 bg-brand-500/10"
                      : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/5",
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              );
            })}
          </nav>

          {/* Company dropdown */}
          <div className="relative shrink-0">
            <button
              onClick={() => setProfileOpen((v) => !v)}
              className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-[var(--border)] hover:border-white/15 transition-colors"
            >
              <div className="w-7 h-7 rounded-lg bg-brand-500/20 flex items-center justify-center text-brand-400 font-bold text-xs">
                {company?.company_name?.charAt(0)?.toUpperCase() ?? "?"}
              </div>
              <span className="text-sm font-medium text-[var(--text)] max-w-[120px] truncate hidden sm:block">
                {company?.company_name ?? "Company"}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            </button>

            {profileOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setProfileOpen(false)}
                />
                <div className="absolute right-0 top-full mt-2 w-52 z-50 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-[var(--border)]">
                    <p className="text-xs text-[var(--text-dim)]">Signed in as</p>
                    <p className="text-sm font-semibold text-[var(--text)] truncate">
                      {company?.email}
                    </p>
                  </div>
                  <div className="p-1">
                    <Link
                      href="/settings"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/5 rounded-lg transition-colors"
                    >
                      <Settings className="w-4 h-4" />
                      Account Settings
                    </Link>
                    <button
                      onClick={() => { setProfileOpen(false); logout(); }}
                      className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-red-400 hover:bg-red-500/8 rounded-lg transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Log Out
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
