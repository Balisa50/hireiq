"use client";

import React, { useState, useCallback } from "react";
import { Save } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { companyAPI } from "@/lib/api";
import { FOCUS_AREAS } from "@/lib/types";
import Button from "@/components/ui/Button";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-border rounded-[4px] p-6 space-y-5">
      <h2 className="text-[11px] font-semibold text-muted uppercase tracking-widest">{title}</h2>
      {children}
    </section>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink ${checked ? "bg-ink" : "bg-border"}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${checked ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  );
}

export default function InterviewDefaultsPage() {
  const { company, refreshProfile } = useAuth();

  const [questionCount, setQuestionCount] = useState(company?.default_question_count ?? 8);
  const [focusAreas, setFocusAreas]       = useState<string[]>(company?.default_focus_areas ?? []);
  const [introMessage, setIntroMessage]   = useState(company?.custom_intro_message ?? "");
  const [language, setLanguage]           = useState("en");
  const [anonymise, setAnonymise]         = useState(false);
  const [autoClose, setAutoClose]         = useState(0);

  const [isSaving, setIsSaving]       = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError]     = useState("");

  const toggle = useCallback((area: string) => {
    setFocusAreas((p) => p.includes(area) ? p.filter((a) => a !== area) : [...p, area]);
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true); setSaveError(""); setSaveSuccess(false);
    try {
      await companyAPI.updateProfile({ default_question_count: questionCount, default_focus_areas: focusAreas, custom_intro_message: introMessage });
      await refreshProfile();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) { setSaveError(e instanceof Error ? e.message : "Failed to save."); }
    finally { setIsSaving(false); }
  }, [questionCount, focusAreas, introMessage, refreshProfile]);

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-xl font-semibold text-ink">Interview Defaults</h1>
        <p className="text-sub text-sm mt-1">Applied to all jobs unless overridden per-role.</p>
      </div>

      {saveSuccess && <div className="rounded-[4px] bg-green-50 border border-success/30 px-4 py-3 text-sm text-success">Settings saved.</div>}
      {saveError && <div className="rounded-[4px] bg-red-50 border border-danger/20 px-4 py-3 text-sm text-danger">{saveError}</div>}

      <Section title="Questions">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-ink">Default number of questions</label>
            <span className="text-sm font-semibold text-ink tabular-nums">{questionCount}</span>
          </div>
          <input type="range" min={5} max={15} value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))} className="w-full" />
          <div className="flex justify-between text-[13px] text-muted"><span>5, Quick screen</span><span>15, In-depth</span></div>
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-medium text-ink">Default focus areas</label>
          <div className="flex flex-wrap gap-2">
            {FOCUS_AREAS.map((area) => {
              const sel = focusAreas.includes(area);
              return (
                <button key={area} type="button" onClick={() => toggle(area)}
                  className={`px-3 py-1.5 rounded-[4px] text-[13px] font-medium transition-all border ${sel ? "bg-ink text-white border-ink" : "bg-white text-sub border-border hover:border-ink hover:text-ink"}`}>
                  {area}
                </button>
              );
            })}
          </div>
          <p className="text-[13px] text-muted">{focusAreas.length} area{focusAreas.length !== 1 ? "s" : ""} selected</p>
        </div>
      </Section>

      <Section title="Candidate experience">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-ink">Custom intro message for candidates</label>
          <textarea value={introMessage} onChange={(e) => setIntroMessage(e.target.value)} rows={3}
            placeholder="Optional message shown before candidates start. e.g. 'Thank you for applying. This interview takes around 20 minutes.'"
            className="w-full bg-white border border-border rounded-[4px] px-4 py-3 text-sm text-ink outline-none resize-none placeholder:text-muted transition-colors focus:border-ink"
            maxLength={1000} />
          <p className="text-[13px] text-muted text-right">{introMessage.length}/1000</p>
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-ink">Interview language</label>
          <select value={language} onChange={(e) => setLanguage(e.target.value)}
            className="w-full bg-white border border-border rounded-[4px] px-3 py-2 text-sm text-ink outline-none focus:border-ink transition-colors appearance-none cursor-pointer">
            <option value="en">English</option>
            <option value="fr" disabled>French (coming soon)</option>
            <option value="ar" disabled>Arabic (coming soon)</option>
            <option value="es" disabled>Spanish (coming soon)</option>
          </select>
        </div>
      </Section>

      <Section title="Hiring controls">
        <div className="flex items-center justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-ink">Candidate anonymisation</p>
            <p className="text-[13px] text-sub mt-0.5">Hide candidate names until you choose to reveal them. Enables blind hiring.</p>
          </div>
          <Toggle checked={anonymise} onChange={setAnonymise} />
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-ink">Auto-close job after</label>
          <div className="flex items-center gap-3">
            <input type="number" min={0} max={500} value={autoClose} onChange={(e) => setAutoClose(Number(e.target.value))}
              className="w-24 bg-white border border-border rounded-[4px] px-3 py-2 text-sm text-ink outline-none focus:border-ink transition-colors text-center" />
            <span className="text-sm text-sub">interviews <span className="text-muted">(0 = never auto-close)</span></span>
          </div>
        </div>
      </Section>

      <Button className="w-full" size="lg" onClick={handleSave} isLoading={isSaving} loadingText="Saving…">
        <Save className="w-4 h-4" /> Save Defaults
      </Button>
    </div>
  );
}
