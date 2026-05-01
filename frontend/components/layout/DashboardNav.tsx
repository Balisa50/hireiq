"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Briefcase, Users, Settings, LogOut, ChevronDown } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { clsx } from "clsx";

const NAV_ITEMS = [
  { href: "/dashboard",  label: "Dashboard",  icon: LayoutDashboard },
  { href: "/jobs",       label: "Jobs",        icon: Briefcase },
  { href: "/candidates", label: "Candidates",  icon: Users },
  { href: "/settings",   label: "Settings",    icon: Settings },
] as const;

/* The brand mark, speech bubble + check, inline SVG */
function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <polyline points="9 11 12 14 15 8" />
    </svg>
  );
}

export default function DashboardNav() {
  const pathname = usePathname();
  const { company, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);

  const initials = React.useMemo(() => {
    const name = company?.company_name?.trim() ?? "";
    const words = name.split(/\s+/).filter(Boolean);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase() || "?";
  }, [company?.company_name]);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between gap-8">

          {/* Brand */}
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-ink font-semibold text-base tracking-tight shrink-0 hover:text-ink-2 transition-colors"
          >
            <BrandMark className="w-5 h-5 text-ink" />
            HireIQ
          </Link>

          {/* Nav */}
          <nav className="hidden md:flex items-center gap-0.5">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  className={clsx(
                    "flex items-center gap-2 px-3 py-1.5 text-sm rounded-[4px] transition-colors",
                    isActive
                      ? "text-ink font-medium bg-canvas"
                      : "text-sub hover:text-ink hover:bg-canvas",
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
              className="flex items-center gap-2 px-3 py-1.5 rounded-[4px] border border-border hover:border-sub transition-colors"
            >
              <div className="w-6 h-6 rounded-full bg-ink flex items-center justify-center text-white text-[10px] font-semibold tracking-tight">
                {initials}
              </div>
              <span className="text-sm text-ink max-w-[120px] truncate hidden sm:block">
                {company?.company_name ?? "Company"}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-muted" />
            </button>

            {profileOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
                <div className="absolute right-0 top-full mt-1.5 w-52 z-50 bg-white border border-border rounded-[4px] shadow-pop overflow-hidden">
                  <div className="px-4 py-3 border-b border-border">
                    <p className="text-[13px] text-muted">Signed in as</p>
                    <p className="text-sm font-medium text-ink truncate">{company?.email}</p>
                  </div>
                  <div className="p-1">
                    <Link
                      href="/settings"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-sub hover:text-ink hover:bg-canvas rounded-[4px] transition-colors"
                    >
                      <Settings className="w-4 h-4" />
                      Account Settings
                    </Link>
                    <button
                      onClick={() => { setProfileOpen(false); logout(); }}
                      className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-danger hover:bg-red-50 rounded-[4px] transition-colors"
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
