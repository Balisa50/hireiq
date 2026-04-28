"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2, Users, Mail, Bell,
  ClipboardList, Palette, Puzzle, CreditCard,
  Shield, AlertTriangle,
} from "lucide-react";
import { clsx } from "clsx";

// ── Nav structure ──────────────────────────────────────────────────────────────

const NAV_GROUPS = [
  {
    label: "Account",
    items: [
      { href: "/settings/workspace",    label: "General",       icon: Building2 },
      { href: "/settings/team",         label: "Team",          icon: Users },
    ],
  },
  {
    label: "Communications",
    items: [
      { href: "/settings/email",         label: "Email",         icon: Mail },
      { href: "/settings/notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    label: "Hiring",
    items: [
      { href: "/settings/applications",  label: "Applications",  icon: ClipboardList },
      { href: "/settings/branding",      label: "Branding",      icon: Palette },
    ],
  },
  {
    label: "Platform",
    items: [
      { href: "/settings/integrations",  label: "Integrations",  icon: Puzzle },
      { href: "/settings/billing",       label: "Billing",       icon: CreditCard },
      { href: "/settings/security",      label: "Security",      icon: Shield },
    ],
  },
];

const DANGER_ITEM = { href: "/settings/danger", label: "Danger Zone", icon: AlertTriangle };

// ── Sidebar nav item ───────────────────────────────────────────────────────────

function SettingsNavItem({
  href,
  label,
  icon: Icon,
  active,
  danger = false,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
  danger?: boolean;
}) {
  return (
    <Link
      href={href}
      className={clsx(
        "flex items-center gap-2.5 h-8 px-3 rounded-[4px] text-[13px] transition-colors duration-150 relative",
        danger
          ? active
            ? "text-danger font-medium bg-red-50"
            : "text-danger/70 hover:text-danger hover:bg-red-50"
          : active
          ? "text-ink font-medium bg-[var(--bg)]"
          : "text-sub hover:text-ink hover:bg-[var(--bg)]",
      )}
    >
      {active && !danger && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-ink rounded-r-full" />
      )}
      <Icon className="w-3.5 h-3.5 shrink-0" />
      {label}
    </Link>
  );
}

// ── Desktop sidebar ────────────────────────────────────────────────────────────

function DesktopNav({ pathname }: { pathname: string }) {
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  return (
    <nav className="hidden md:block w-44 shrink-0 sticky top-10 self-start">
      <div className="space-y-1">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-2">
            <p className="px-3 pb-1 pt-3 text-[10px] font-semibold text-muted uppercase tracking-widest select-none">
              {group.label}
            </p>
            {group.items.map((item) => (
              <SettingsNavItem
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={isActive(item.href)}
              />
            ))}
          </div>
        ))}
        <div className="border-t border-border pt-2 mt-2">
          <SettingsNavItem
            href={DANGER_ITEM.href}
            label={DANGER_ITEM.label}
            icon={DANGER_ITEM.icon}
            active={isActive(DANGER_ITEM.href)}
            danger
          />
        </div>
      </div>
    </nav>
  );
}

// ── Mobile scrollable tab bar ──────────────────────────────────────────────────

function MobileNav({ pathname }: { pathname: string }) {
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const allItems = [
    ...NAV_GROUPS.flatMap((g) => g.items),
    DANGER_ITEM,
  ];
  return (
    <div className="md:hidden -mx-6 sm:-mx-8 px-4 border-b border-border bg-white mb-6 overflow-x-auto sticky top-14 z-20">
      <div className="flex gap-0 min-w-max">
        {allItems.map((item) => {
          const active = isActive(item.href);
          const isDanger = item.href === DANGER_ITEM.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-1.5 px-3 py-3 text-[13px] whitespace-nowrap border-b-2 transition-colors",
                isDanger
                  ? active
                    ? "border-danger text-danger font-medium"
                    : "border-transparent text-danger/60 hover:text-danger"
                  : active
                  ? "border-ink text-ink font-medium"
                  : "border-transparent text-sub hover:text-ink",
              )}
            >
              <item.icon className="w-3.5 h-3.5 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ── Layout ─────────────────────────────────────────────────────────────────────

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div>
      <MobileNav pathname={pathname} />
      <div className="flex gap-10">
        <DesktopNav pathname={pathname} />
        <div className="flex-1 min-w-0">
          {children}
        </div>
      </div>
    </div>
  );
}
