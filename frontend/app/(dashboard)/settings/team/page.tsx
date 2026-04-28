"use client";

import React, { useState } from "react";
import { Crown, Shield, User, Mail, MoreHorizontal } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

type Role = "Owner" | "Admin" | "Recruiter";

const ROLE_META: Record<Role, { label: string; icon: React.ElementType; color: string }> = {
  Owner:     { label: "Owner",     icon: Crown,   color: "text-amber-600 bg-amber-50 border-amber-200" },
  Admin:     { label: "Admin",     icon: Shield,  color: "text-blue-600 bg-blue-50 border-blue-200" },
  Recruiter: { label: "Recruiter", icon: User,    color: "text-sub bg-[var(--bg)] border-border" },
};

function RoleBadge({ role }: { role: Role }) {
  const meta = ROLE_META[role];
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-[11px] font-semibold border ${meta.color}`}>
      <Icon className="w-3 h-3" />
      {meta.label}
    </span>
  );
}

function Section({ title, description, children }: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-border rounded-[4px] p-6 space-y-5">
      <div>
        <h2 className="text-[11px] font-semibold text-muted uppercase tracking-widest">{title}</h2>
        {description && <p className="text-[13px] text-sub mt-1">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export default function TeamSettingsPage() {
  const { company } = useAuth();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole]   = useState<Role>("Recruiter");
  const [inviteSent, setInviteSent]   = useState(false);

  const joinedAt = company?.created_at
    ? new Date(company.created_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" })
    : "";

  const handleInvite = () => {
    if (!inviteEmail) return;
    const subject = encodeURIComponent(
      `You're invited to join ${company?.company_name ?? "our team"} on HireIQ`
    );
    const body = encodeURIComponent(
      `Hi,\n\nYou've been invited to join ${company?.company_name ?? "our HireIQ workspace"} as ${inviteRole === "Admin" ? "an" : "a"} ${inviteRole}.\n\nSign up at https://hireiq.app to get started.\n\nBest,\n${company?.company_name}`
    );
    window.open(`mailto:${inviteEmail}?subject=${subject}&body=${body}`);
    setInviteSent(true);
    setInviteEmail("");
    setTimeout(() => setInviteSent(false), 5000);
  };

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-xl font-semibold text-ink">Team</h1>
        <p className="text-sub text-sm mt-1">Manage who has access to your HireIQ workspace.</p>
      </div>

      {/* Members list */}
      <Section title="Members" description="1 member">
        <div className="divide-y divide-border">
          <div className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
            <div className="w-8 h-8 rounded-full bg-ink flex items-center justify-center text-white text-[11px] font-semibold shrink-0 select-none">
              {(company?.company_name ?? "?").slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-ink truncate">{company?.company_name}</p>
                <span className="text-[11px] text-muted">(you)</span>
              </div>
              <p className="text-[13px] text-sub truncate">{company?.email}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <RoleBadge role="Owner" />
              {joinedAt && <span className="text-[12px] text-muted hidden sm:block">Since {joinedAt}</span>}
            </div>
          </div>
        </div>
      </Section>

      {/* Invite */}
      <Section title="Invite a teammate" description="Add colleagues to collaborate on hiring.">
        {inviteSent && (
          <div className="rounded-[4px] bg-green-50 border border-success/30 px-4 py-3 text-sm text-success">
            Invitation email composed. Share it with your colleague to get them started.
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Input
              label=""
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="colleague@company.com"
              type="email"
            />
          </div>
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as Role)}
            className="h-[38px] bg-white border border-border rounded-[4px] px-3 text-sm text-ink outline-none focus:border-ink transition-colors appearance-none cursor-pointer"
          >
            <option value="Admin">Admin</option>
            <option value="Recruiter">Recruiter</option>
          </select>
          <Button onClick={handleInvite} disabled={!inviteEmail}>
            <Mail className="w-4 h-4" /> Send Invite
          </Button>
        </div>
        <div className="bg-[var(--bg)] rounded-[4px] border border-border p-4 space-y-2">
          <p className="text-[12px] font-semibold text-ink uppercase tracking-wide">Role permissions</p>
          <div className="space-y-1.5 text-[13px] text-sub">
            <p><span className="font-medium text-ink">Owner</span> — Full access including billing and account deletion</p>
            <p><span className="font-medium text-ink">Admin</span> — Manage jobs, candidates and settings (no billing)</p>
            <p><span className="font-medium text-ink">Recruiter</span> — View and action candidates, read-only on jobs</p>
          </div>
        </div>
        <p className="text-[12px] text-muted">
          Multi-seat access is available on the Growth plan.{" "}
          <a href="mailto:support@hireiq.app?subject=Team seats" className="underline hover:text-ink transition-colors">
            Contact us to upgrade.
          </a>
        </p>
      </Section>
    </div>
  );
}
