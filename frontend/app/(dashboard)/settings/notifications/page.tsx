"use client";

import React, { useState, useCallback, useEffect } from "react";
import { Save } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { companyAPI } from "@/lib/api";
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

function NotifRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-4 border-b border-border last:border-b-0">
      <div className="flex-1">
        <p className="text-sm font-medium text-ink">{label}</p>
        <p className="text-[13px] text-sub mt-0.5 leading-relaxed">{description}</p>
      </div>
      <div className="shrink-0 pt-0.5">
        <Toggle checked={checked} onChange={onChange} />
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const { company, refreshProfile } = useAuth();

  const [onApplication,  setOnApplication]  = useState(company?.notify_on_application  ?? true);
  const [onScored,       setOnScored]       = useState(company?.notify_on_scored        ?? true);
  const [dailyDigest,    setDailyDigest]    = useState(company?.notify_daily_digest     ?? false);
  const [weeklySummary,  setWeeklySummary]  = useState(company?.notify_weekly_summary   ?? false);

  const [isSaving, setIsSaving]       = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError]     = useState("");

  useEffect(() => {
    if (company) {
      setOnApplication(company.notify_on_application  ?? true);
      setOnScored(company.notify_on_scored             ?? true);
      setDailyDigest(company.notify_daily_digest       ?? false);
      setWeeklySummary(company.notify_weekly_summary   ?? false);
    }
  }, [company]);

  const handleSave = useCallback(async () => {
    setIsSaving(true); setSaveError(""); setSaveSuccess(false);
    try {
      await companyAPI.updateProfile({
        notify_on_application: onApplication,
        notify_on_scored:      onScored,
        notify_daily_digest:   dailyDigest,
        notify_weekly_summary: weeklySummary,
      });
      await refreshProfile();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save.");
    } finally { setIsSaving(false); }
  }, [onApplication, onScored, dailyDigest, weeklySummary, refreshProfile]);

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-xl font-semibold text-ink">Notifications</h1>
        <p className="text-sub text-sm mt-1">Control when HireIQ sends you email alerts.</p>
      </div>

      {saveSuccess && (
        <div className="rounded-[4px] bg-green-50 border border-success/30 px-4 py-3 text-sm text-success">
          Notification preferences saved.
        </div>
      )}
      {saveError && (
        <div className="rounded-[4px] bg-red-50 border border-danger/20 px-4 py-3 text-sm text-danger">
          {saveError}
        </div>
      )}

      <div className="bg-white border border-border rounded-[4px] px-6">
        <NotifRow
          label="Application received"
          description="Email when a candidate submits their application, including their name and job role."
          checked={onApplication}
          onChange={setOnApplication}
        />
        <NotifRow
          label="Candidate scored"
          description="Email when AI scoring completes, with overall score and hiring recommendation."
          checked={onScored}
          onChange={setOnScored}
        />
        <NotifRow
          label="Daily digest"
          description="A morning summary of all applications received in the last 24 hours."
          checked={dailyDigest}
          onChange={setDailyDigest}
        />
        <NotifRow
          label="Weekly hiring summary"
          description="Every Monday: applications from the past week, top candidates, status breakdown."
          checked={weeklySummary}
          onChange={setWeeklySummary}
        />
      </div>

      <p className="text-[13px] text-muted">
        All notifications are sent to{" "}
        <span className="font-medium text-ink">{company?.email}</span>.
        Update your email in{" "}
        <a href="/settings/workspace" className="underline hover:text-ink transition-colors">
          General settings
        </a>.
      </p>

      <Button className="w-full" size="lg" onClick={handleSave} isLoading={isSaving} loadingText="Saving…">
        <Save className="w-4 h-4" /> Save Preferences
      </Button>
    </div>
  );
}
