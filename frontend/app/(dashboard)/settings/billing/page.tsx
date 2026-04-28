"use client";

import React from "react";
import { CheckCircle2, Zap, Mail } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import Button from "@/components/ui/Button";

const STARTER_FEATURES = [
  "2 active jobs",
  "50 applications / month",
  "AI scoring and assessment reports",
  "PDF export",
  "Application link sharing",
];

const GROWTH_FEATURES = [
  "Unlimited active jobs",
  "Unlimited applications",
  "Branded application page (your logo)",
  "Custom intro message",
  "Priority support",
];

export default function BillingPage() {
  const { company } = useAuth();

  // In this version every account is on Starter (free)
  const currentPlan = "starter";

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-xl font-semibold text-ink">Billing & Plan</h1>
        <p className="text-sub text-sm mt-1">Your current plan and usage.</p>
      </div>

      {/* Current plan */}
      <section className="bg-white border border-border rounded-[4px] p-6 space-y-4">
        <h2 className="text-[11px] font-semibold text-muted uppercase tracking-widest">Current plan</h2>

        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-base font-semibold text-ink">Starter</p>
            <p className="text-sm text-sub mt-0.5">Free forever — no credit card required</p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-green-50 text-success border border-success/20">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
            Active
          </span>
        </div>

        <ul className="space-y-2 pt-2">
          {STARTER_FEATURES.map((f) => (
            <li key={f} className="flex items-center gap-2.5 text-sm text-sub">
              <CheckCircle2 className="w-4 h-4 text-success shrink-0" strokeWidth={1.5} />
              {f}
            </li>
          ))}
        </ul>
      </section>

      {/* Upgrade prompt */}
      <section className="bg-ink rounded-[4px] p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-white" strokeWidth={2} />
          <h2 className="text-sm font-semibold text-white">Upgrade to Growth — $1/month</h2>
        </div>
        <p className="text-[13px] text-white/70 leading-relaxed">
          Unlock unlimited jobs, unlimited applications, and branded application pages with your company logo.
        </p>
        <ul className="space-y-2">
          {GROWTH_FEATURES.map((f) => (
            <li key={f} className="flex items-center gap-2.5 text-[13px] text-white/90">
              <CheckCircle2 className="w-3.5 h-3.5 text-white/60 shrink-0" strokeWidth={1.5} />
              {f}
            </li>
          ))}
        </ul>
        <a
          href="mailto:sales@hireiq.app?subject=Upgrade to Growth&body=Hi, I'd like to upgrade my HireIQ account to Growth."
          className="inline-flex items-center gap-2 bg-white text-ink text-sm font-medium px-5 py-2.5 rounded-[4px] hover:bg-[var(--bg)] transition-colors mt-2"
        >
          <Mail className="w-4 h-4" />
          Contact us to upgrade
        </a>
      </section>

      {/* Account info */}
      <section className="bg-white border border-border rounded-[4px] p-6 space-y-3">
        <h2 className="text-[11px] font-semibold text-muted uppercase tracking-widest">Account</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted text-[12px] mb-0.5">Account email</p>
            <p className="text-ink font-medium">{company?.email ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted text-[12px] mb-0.5">Member since</p>
            <p className="text-ink font-medium">
              {company?.created_at
                ? new Date(company.created_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" })
                : "—"}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
