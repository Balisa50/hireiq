"use client";

import React, { useState, useEffect } from "react";
import { Check, Zap, CreditCard, FileText, ArrowUpRight } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { companyAPI } from "@/lib/api";

const STARTER_FEATURES = [
  "Unlimited job postings",
  "AI-powered candidate interviews",
  "4-dimension scoring & reports",
  "PDF candidate reports",
  "Document & link collection",
  "Application controls (deadline, limit, pause)",
  "Email notifications",
  "1 team member",
];

const GROWTH_FEATURES = [
  "Everything in Starter",
  "Up to 5 team members",
  "Custom branding & domain",
  "Advanced analytics dashboard",
  "Bulk candidate exports",
  "ATS integrations (Greenhouse, Lever)",
  "Priority support",
  "Custom question libraries",
];

export default function BillingSettingsPage() {
  const { company } = useAuth();
  const [stats, setStats] = useState<{ total_interviews: number; active_jobs: number } | null>(null);

  useEffect(() => {
    companyAPI.getDashboardStats()
      .then((s) => setStats({ total_interviews: s.total_interviews, active_jobs: s.active_jobs }))
      .catch(() => null);
  }, []);

  const handleUpgrade = () => {
    const subject = encodeURIComponent("Upgrade to HireIQ Growth");
    const body = encodeURIComponent(
      `Hi,\n\nI'd like to upgrade my HireIQ account to the Growth plan.\n\nAccount: ${company?.email}\nCompany: ${company?.company_name}\n\nPlease send me the details.\n\nThank you.`
    );
    window.open(`mailto:support@hireiq.app?subject=${subject}&body=${body}`);
  };

  const memberSince = company?.created_at
    ? new Date(company.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : "—";

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-xl font-semibold text-ink">Billing</h1>
        <p className="text-sub text-sm mt-1">Your plan, usage, and payment information.</p>
      </div>

      {/* Current plan */}
      <section className="bg-white border border-border rounded-[4px] p-6 space-y-5">
        <h2 className="text-[11px] font-semibold text-muted uppercase tracking-widest">Current plan</h2>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className="text-lg font-bold text-ink">Starter</p>
              <span className="text-[11px] font-semibold text-success bg-green-50 border border-success/30 px-2 py-0.5 rounded-[4px] uppercase tracking-wide">
                Active
              </span>
            </div>
            <p className="text-sub text-sm">Free forever. No credit card required.</p>
          </div>
          <button
            onClick={handleUpgrade}
            className="flex items-center gap-2 px-4 py-2 bg-ink text-white text-sm font-semibold rounded-[4px] hover:bg-ink/90 transition-colors"
          >
            <Zap className="w-4 h-4" /> Upgrade to Growth
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Plan",         value: "Starter" },
            { label: "Billing",      value: "Free" },
            { label: "Team seats",   value: "1" },
            { label: "Member since", value: memberSince },
          ].map(({ label, value }) => (
            <div key={label} className="bg-[var(--bg)] rounded-[4px] border border-border p-3">
              <p className="text-[11px] text-muted uppercase tracking-wider font-semibold">{label}</p>
              <p className="text-sm font-medium text-ink mt-1">{value}</p>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <p className="text-[12px] font-semibold text-muted uppercase tracking-wide">Included on Starter</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
            {STARTER_FEATURES.map((f) => (
              <div key={f} className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-success shrink-0" />
                <span className="text-[13px] text-sub">{f}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Usage */}
      <section className="bg-white border border-border rounded-[4px] p-6 space-y-4">
        <h2 className="text-[11px] font-semibold text-muted uppercase tracking-widest">Usage</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-[var(--bg)] rounded-[4px] border border-border p-4">
            <p className="text-[12px] text-muted uppercase tracking-wider font-semibold">Total interviews</p>
            <p className="text-2xl font-bold text-ink mt-1 tabular-nums">
              {stats !== null ? stats.total_interviews : "—"}
            </p>
            <p className="text-[12px] text-muted mt-1">All time</p>
          </div>
          <div className="bg-[var(--bg)] rounded-[4px] border border-border p-4">
            <p className="text-[12px] text-muted uppercase tracking-wider font-semibold">Active jobs</p>
            <p className="text-2xl font-bold text-ink mt-1 tabular-nums">
              {stats !== null ? stats.active_jobs : "—"}
            </p>
            <p className="text-[12px] text-muted mt-1">Currently live</p>
          </div>
        </div>
      </section>

      {/* Growth upgrade card */}
      <section className="bg-ink rounded-[4px] p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <p className="font-bold text-base text-white">Growth Plan</p>
            </div>
            <p className="text-white/60 text-sm">For scaling teams that need more seats, integrations, and analytics.</p>
          </div>
          <p className="text-white/40 text-sm whitespace-nowrap">Contact for pricing</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
          {GROWTH_FEATURES.map((f) => (
            <div key={f} className="flex items-center gap-2">
              <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-[13px] text-white/75">{f}</span>
            </div>
          ))}
        </div>
        <button
          onClick={handleUpgrade}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-white text-ink text-sm font-semibold rounded-[4px] hover:bg-white/90 transition-colors"
        >
          <ArrowUpRight className="w-4 h-4" /> Get Growth — Contact Us
        </button>
      </section>

      {/* Payment method */}
      <section className="bg-white border border-border rounded-[4px] p-6 space-y-3">
        <h2 className="text-[11px] font-semibold text-muted uppercase tracking-widest">Payment method</h2>
        <div className="flex items-center gap-3 py-2">
          <CreditCard className="w-5 h-5 text-muted shrink-0" />
          <p className="text-sm text-sub">No payment method on file — you&apos;re on the free Starter plan.</p>
        </div>
      </section>

      {/* Invoice history */}
      <section className="bg-white border border-border rounded-[4px] p-6 space-y-3">
        <h2 className="text-[11px] font-semibold text-muted uppercase tracking-widest">Invoice history</h2>
        <div className="flex items-center gap-3 py-2">
          <FileText className="w-5 h-5 text-muted shrink-0" />
          <p className="text-sm text-sub">No invoices yet. They&apos;ll appear here when you upgrade to a paid plan.</p>
        </div>
      </section>
    </div>
  );
}
