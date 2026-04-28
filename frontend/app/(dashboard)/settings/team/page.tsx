"use client";

import React from "react";
import { Crown, Users, Mail } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    owner: "bg-amber-50 text-amber-700 border-amber-200",
    admin: "bg-blue-50 text-blue-700 border-blue-200",
    member: "bg-[var(--bg)] text-sub border-border",
  };
  const labels: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Member" };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${styles[role] ?? styles.member}`}>
      {role === "owner" && <Crown className="w-3 h-3" />}
      {labels[role] ?? role}
    </span>
  );
}

export default function TeamPage() {
  const { company } = useAuth();

  const initials = React.useMemo(() => {
    const name  = company?.email?.trim() ?? "";
    return name.slice(0, 2).toUpperCase() || "?";
  }, [company?.email]);

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-xl font-semibold text-ink">Team</h1>
        <p className="text-sub text-sm mt-1">Members who have access to this HireIQ workspace.</p>
      </div>

      {/* Members list */}
      <section className="bg-white border border-border rounded-[4px] overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-[11px] font-semibold text-muted uppercase tracking-widest">Members</h2>
        </div>

        {/* Current user */}
        <div className="flex items-center gap-4 px-6 py-4">
          <div className="w-9 h-9 rounded-full bg-ink flex items-center justify-center text-white text-[12px] font-semibold shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ink truncate">{company?.company_name ?? "—"}</p>
            <p className="text-[13px] text-muted truncate">{company?.email ?? "—"}</p>
          </div>
          <RoleBadge role="owner" />
        </div>
      </section>

      {/* Invite placeholder */}
      <section className="bg-white border border-border rounded-[4px] p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-muted" />
          <h2 className="text-[11px] font-semibold text-muted uppercase tracking-widest">Invite team members</h2>
        </div>
        <p className="text-sm text-sub leading-relaxed">
          Multi-user access is available on the Growth plan. Invite your hiring team so they can
          review candidates, download reports, and manage jobs — all from one account.
        </p>
        <a
          href="mailto:sales@hireiq.app?subject=Multi-user access for HireIQ"
          className="inline-flex items-center gap-2 text-sm font-medium text-ink border border-border rounded-[4px] px-4 py-2 hover:bg-[var(--bg)] transition-colors"
        >
          <Mail className="w-4 h-4" />
          Contact us about team access
        </a>
      </section>
    </div>
  );
}
