"use client";

import { ChevronRight } from "lucide-react";
import type { JobPublicInfo } from "@/lib/types";
import { Mark } from "./icons";

export function WelcomeScreen({
  jobInfo,
  onStart,
  isStarting,
}: {
  jobInfo: JobPublicInfo;
  onStart: () => void;
  isStarting?: boolean;
}) {
  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-4 py-12" dir="ltr">
      <div className="max-w-[520px] w-full space-y-8">

        {/* Brand mark */}
        <div className="flex justify-center">
          <Mark className="w-7 h-7 text-ink" />
        </div>

        {/* Job context */}
        <div className="text-center space-y-2">
          <p className="text-[12px] font-semibold text-muted uppercase tracking-widest">
            {jobInfo.company_name}
          </p>
          <h1
            className="text-[30px] font-bold text-ink leading-tight"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            {jobInfo.title}
          </h1>
          {(jobInfo.department || jobInfo.location || jobInfo.employment_type) && (
            <p className="text-[13px] text-muted">
              {[jobInfo.department, jobInfo.location, jobInfo.employment_type].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>

        {/* Job description */}
        {jobInfo.job_description && (
          <div className="bg-white border border-border rounded-[4px] px-5 py-4">
            <p className="text-[13px] text-sub leading-relaxed whitespace-pre-line">
              {jobInfo.job_description}
            </p>
          </div>
        )}

        {/* What to expect */}
        <div className="bg-white border border-border rounded-[4px] divide-y divide-border">
          {[
            { icon: "01", text: "You'll have a short conversation with our AI assistant, it asks questions, you type your answers." },
            { icon: "02", text: "Be specific and honest. There are no trick questions, just tell your story." },
            { icon: "03", text: "Takes around 10, 15 minutes. Your progress is saved if you need to pause." },
          ].map(({ icon, text }) => (
            <div key={icon} className="flex items-start gap-4 px-5 py-4">
              <span className="text-[11px] font-semibold text-muted tabular-nums shrink-0 mt-0.5">{icon}</span>
              <p className="text-[13px] text-sub leading-relaxed">{text}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={onStart}
          disabled={isStarting}
          className="w-full bg-[#1A1714] text-white rounded-[4px] px-4 py-3.5 text-[14px] font-semibold hover:bg-[#2d2926] transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {isStarting ? "Starting…" : <><span>Start Application</span> <ChevronRight className="w-4 h-4" /></>}
        </button>

        <p className="text-center text-[11px] text-muted">Secured by HireIQ</p>
      </div>
    </div>
  );
}
