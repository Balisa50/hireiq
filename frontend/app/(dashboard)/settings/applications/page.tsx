"use client";

import React, { useState, useCallback, useEffect } from "react";
import { Save } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { companyAPI } from "@/lib/api";
import { FOCUS_AREAS } from "@/lib/types";
import Button from "@/components/ui/Button";

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink ${checked ? "bg-ink" : "bg-border"}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${checked ? "translate-x-5" : "translate-x-0"}`}
      />
    </button>
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

const SEVERITY_OPTIONS = [
  { value: "surface",  label: "Surface",  description: "Quick, conversational questions. Best for volume hiring." },
  { value: "standard", label: "Standard", description: "Balanced depth. Good for most roles." },
  { value: "deep",     label: "Deep",     description: "Challenging, scenario-based questions. Best for senior roles." },
];

export default function ApplicationsSettingsPage() {
  const { company, refreshProfile } = useAuth();

  const [questionCount,    setQuestionCount]    = useState(company?.default_question_count ?? 8);
  const [focusAreas,       setFocusAreas]       = useState<string[]>(company?.default_focus_areas ?? []);
  const [introMessage,     setIntroMessage]     = useState(company?.custom_intro_message ?? "");
  const [severity,         setSeverity]         = useState(company?.default_severity ?? "standard");
  const [autoClose,        setAutoClose]        = useState(company?.auto_close_on_limit ?? false);
  const [deadlineDays,     setDeadlineDays]     = useState<string>(String(company?.default_deadline_days ?? ""));
  const [retentionDays,    setRetentionDays]    = useState(company?.data_retention_days ?? 365);

  const [isSaving, setIsSaving]       = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError]     = useState("");

  useEffect(() => {
    if (company) {
      setQuestionCount(company.default_question_count);
      setFocusAreas(company.default_focus_areas ?? []);
      setIntroMessage(company.custom_intro_message ?? "");
      setSeverity(company.default_severity ?? "standard");
      setAutoClose(company.auto_close_on_limit ?? false);
      setDeadlineDays(company.default_deadline_days ? String(company.default_deadline_days) : "");
      setRetentionDays(company.data_retention_days ?? 365);
    }
  }, [company]);

  const toggleFocusArea = useCallback((area: string) => {
    setFocusAreas((p) => p.includes(area) ? p.filter((a) => a !== area) : [...p, area]);
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true); setSaveError(""); setSaveSuccess(false);
    try {
      await companyAPI.updateProfile({
        default_question_count: questionCount,
        default_focus_areas:    focusAreas,
        custom_intro_message:   introMessage || null,
        default_severity:       severity,
        auto_close_on_limit:    autoClose,
        default_deadline_days:  deadlineDays ? parseInt(deadlineDays, 10) : null,
        data_retention_days:    retentionDays,
      });
      await refreshProfile();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save.");
    } finally { setIsSaving(false); }
  }, [questionCount, focusAreas, introMessage, severity, autoClose, deadlineDays, retentionDays, refreshProfile]);

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-xl font-semibold text-ink">Applications</h1>
        <p className="text-sub text-sm mt-1">Default settings applied to all new jobs unless overridden per role.</p>
      </div>

      {saveSuccess && (
        <div className="rounded-[4px] bg-green-50 border border-success/30 px-4 py-3 text-sm text-success">
          Application defaults saved.
        </div>
      )}
      {saveError && (
        <div className="rounded-[4px] bg-red-50 border border-danger/20 px-4 py-3 text-sm text-danger">
          {saveError}
        </div>
      )}

      {/* Questions */}
      <Section title="Question defaults">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-ink">Default number of questions</label>
            <span className="text-sm font-semibold text-ink tabular-nums w-6 text-right">{questionCount}</span>
          </div>
          <input
            type="range"
            min={5}
            max={15}
            value={questionCount}
            onChange={(e) => setQuestionCount(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-[13px] text-muted">
            <span>5 — Quick screen</span>
            <span>15 — In-depth</span>
          </div>
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-medium text-ink">Default focus areas</label>
          <div className="flex flex-wrap gap-2">
            {FOCUS_AREAS.map((area) => {
              const sel = focusAreas.includes(area);
              return (
                <button
                  key={area}
                  type="button"
                  onClick={() => toggleFocusArea(area)}
                  className={`px-3 py-1.5 rounded-[4px] text-[13px] font-medium transition-all border ${sel ? "bg-ink text-white border-ink" : "bg-white text-sub border-border hover:border-ink hover:text-ink"}`}
                >
                  {area}
                </button>
              );
            })}
          </div>
          <p className="text-[13px] text-muted">{focusAreas.length} area{focusAreas.length !== 1 ? "s" : ""} selected</p>
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-medium text-ink">Default question severity</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {SEVERITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSeverity(opt.value)}
                className={`text-left p-3 rounded-[4px] border transition-all ${severity === opt.value ? "border-ink bg-[var(--bg)]" : "border-border bg-white hover:border-ink/50"}`}
              >
                <p className={`text-sm font-medium ${severity === opt.value ? "text-ink" : "text-sub"}`}>{opt.label}</p>
                <p className="text-[12px] text-muted mt-0.5 leading-relaxed">{opt.description}</p>
              </button>
            ))}
          </div>
        </div>
      </Section>

      {/* Candidate experience */}
      <Section title="Candidate experience">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-ink">Custom intro message</label>
          <textarea
            value={introMessage}
            onChange={(e) => setIntroMessage(e.target.value)}
            rows={3}
            placeholder="Optional message shown to candidates before they start. E.g. 'Thank you for applying. This interview takes around 20 minutes.'"
            className="w-full bg-white border border-border rounded-[4px] px-4 py-3 text-sm text-ink outline-none resize-none placeholder:text-muted transition-colors focus:border-ink"
            maxLength={1000}
          />
          <p className="text-[13px] text-muted text-right">{introMessage.length}/1000</p>
        </div>
      </Section>

      {/* Hiring controls */}
      <Section title="Hiring controls">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-ink">Auto-close on limit</p>
            <p className="text-[13px] text-sub mt-0.5">
              Automatically close a job when it reaches its application limit.
            </p>
          </div>
          <div className="shrink-0 pt-0.5">
            <Toggle checked={autoClose} onChange={setAutoClose} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-ink">Default deadline (days)</label>
            <input
              type="number"
              min={1}
              max={365}
              value={deadlineDays}
              onChange={(e) => setDeadlineDays(e.target.value)}
              placeholder="e.g. 30"
              className="w-full bg-white border border-border rounded-[4px] px-3 py-2 text-sm text-ink outline-none focus:border-ink transition-colors"
            />
            <p className="text-[12px] text-muted">Days from job publish date. Leave blank for no default.</p>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-ink">Data retention (days)</label>
            <input
              type="number"
              min={30}
              max={730}
              value={retentionDays}
              onChange={(e) => setRetentionDays(Number(e.target.value))}
              className="w-full bg-white border border-border rounded-[4px] px-3 py-2 text-sm text-ink outline-none focus:border-ink transition-colors"
            />
            <p className="text-[12px] text-muted">How long candidate data is kept after completion.</p>
          </div>
        </div>
      </Section>

      <Button className="w-full" size="lg" onClick={handleSave} isLoading={isSaving} loadingText="Saving…">
        <Save className="w-4 h-4" /> Save Application Defaults
      </Button>
    </div>
  );
}
