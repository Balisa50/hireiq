"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Briefcase, Users, Building2,
  Settings, LogOut, ChevronDown, Menu, X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { clsx } from "clsx";

// ── Brand mark SVG ────────────────────────────────────────────────────────────

function BrandMark({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      className={className}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <polyline points="9 11 12 14 15 8" />
    </svg>
  );
}

// ── Nav item ──────────────────────────────────────────────────────────────────

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  onClick,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={clsx(
        "flex items-center gap-3 h-9 px-3 text-sm rounded-[2px] transition-colors duration-150 relative",
        active
          ? "text-ink font-medium bg-[var(--bg)]"
          : "text-sub hover:text-ink hover:bg-[var(--bg)]",
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-ink rounded-r-full" />
      )}
      <Icon className="w-4 h-4 shrink-0" />
      {label}
    </Link>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pt-5 pb-1 text-[10px] font-semibold text-muted uppercase tracking-widest select-none">
      {children}
    </p>
  );
}

// ── Sidebar content (shared between desktop + mobile) ─────────────────────────

function SidebarContent({ onNav }: { onNav?: () => void }) {
  const pathname   = usePathname();
  const { company, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);

  const initials = React.useMemo(() => {
    const name  = company?.company_name?.trim() ?? "";
    const words = name.split(/\s+/).filter(Boolean);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase() || "?";
  }, [company?.company_name]);

  const isActive = useCallback(
    (href: string) => {
      if (href === "/dashboard") return pathname === href;
      if (href === "/settings") return pathname === href || pathname.startsWith("/settings/");
      return pathname === href || pathname.startsWith(href + "/");
    },
    [pathname],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="px-4 py-5 border-b border-border">
        <Link href="/dashboard" onClick={onNav} className="flex items-center gap-2.5 text-ink hover:text-ink-2 transition-colors">
          <BrandMark className="w-5 h-5" />
          <span className="font-semibold text-[15px] tracking-tight">HireIQ</span>
        </Link>
        {company?.company_name && (
          <p className="text-[12px] text-muted mt-1.5 pl-0.5 truncate">{company.company_name}</p>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-2 overflow-y-auto">
        <SectionLabel>Hiring</SectionLabel>
        <NavItem href="/dashboard"  label="Dashboard"  icon={LayoutDashboard} active={pathname === "/dashboard"} onClick={onNav} />
        <NavItem href="/jobs"       label="Jobs"        icon={Briefcase}       active={isActive("/jobs")}       onClick={onNav} />
        <NavItem href="/candidates" label="Candidates"  icon={Users}           active={isActive("/candidates")} onClick={onNav} />

        <SectionLabel>Account</SectionLabel>
        <NavItem href="/settings" label="Settings" icon={Settings} active={isActive("/settings")} onClick={onNav} />
      </nav>

      {/* Profile section */}
      <div className="border-t border-border p-3 relative">
        <button
          onClick={() => setProfileOpen((v) => !v)}
          className="w-full flex items-center gap-3 px-2 py-2 rounded-[4px] hover:bg-[var(--bg)] transition-colors"
        >
          <div className="w-7 h-7 rounded-full bg-ink flex items-center justify-center text-white text-[10px] font-semibold shrink-0">
            {initials}
          </div>
          <span className="text-sm text-ink font-medium truncate flex-1 text-left">
            {company?.company_name ?? "Company"}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-muted shrink-0" />
        </button>

        {profileOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
            <div className="absolute bottom-full left-3 right-3 mb-1 z-50 bg-white border border-border rounded-[4px] shadow-pop overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-[12px] text-muted">Signed in as</p>
                <p className="text-[13px] font-medium text-ink truncate">{company?.email}</p>
              </div>
              <div className="p-1">
                <Link
                  href="/settings/profile"
                  onClick={() => { setProfileOpen(false); onNav?.(); }}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-[13px] text-sub hover:text-ink hover:bg-[var(--bg)] rounded-[4px] transition-colors"
                >
                  <Building2 className="w-4 h-4" />
                  Account Settings
                </Link>
                <button
                  onClick={() => { setProfileOpen(false); logout(); }}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-[13px] text-danger hover:bg-red-50 rounded-[4px] transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main export, handles desktop + mobile ────────────────────────────────────

export default function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-[240px] shrink-0 bg-white border-r border-border min-h-screen sticky top-0 h-screen">
        <SidebarContent />
      </aside>

      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-3 left-3 z-50 w-9 h-9 flex items-center justify-center bg-white border border-border rounded-[4px] shadow-sm"
        aria-label="Open menu"
      >
        <Menu className="w-4 h-4 text-ink" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-ink/20 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile slide-in */}
      <aside
        className={clsx(
          "md:hidden fixed top-0 left-0 bottom-0 w-[240px] z-50 bg-white border-r border-border transition-transform duration-200",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center text-muted hover:text-ink transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
        <SidebarContent onNav={() => setMobileOpen(false)} />
      </aside>
    </>
  );
}
