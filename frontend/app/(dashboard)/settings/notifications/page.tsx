"use client";

import React, { useState, useCallback } from "react";
import { Save } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { companyAPI } from "@/lib/api";
import Button from "@/components/ui/Button";

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink ${checked ? "bg-ink" : "bg-border"}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${checked ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  );
}

function NotifRow({
  label,
  description,
  checked,
  onChange,
  children,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-4 border-b border-border last:border-b-0">
      <div className="flex-1">
        <p className="text-sm font-medium text-ink">{label}</p>
        <p className="text-[13px] text-sub mt-0.5">{description}</p>
        {checked && children && <div className="mt-3">{children}</div>}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

export default function NotificationsPage() {
  const { company, refreshProfile } = useAuth();

  const [onComplete, setOnComplete]     = useState(company?.email_notifications ?? true);
  const [onHighScore, setOnHighScore]   = useState(false);
  const [scoreThreshold, setScoreThreshold] = useState(80);
  const [weeklySummary, setWeeklySummary] = useState(false);

  const [isSaving, setIsSaving]       = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError]     = useState("");

  const handleSave = useCallback(async () => {
    setIsSaving(true); setSaveError(""); setSaveSuccess(false);
    try {
      await companyAPI.updateProfile({ email_notifications: onComplete });
      await refreshProfile();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) { setSaveError(e instanceof Error ? e.message : "Failed to save."); }
    finally { setIsSaving(false); }
  }, [onComplete, refreshProfile]);

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-xl font-semibold text-ink">Notifications</h1>
        <p className="text-sub text-sm mt-1">Control when and how HireIQ contacts you.</p>
      </div>

      {saveSuccess && <div className="rounded-[4px] bg-green-50 border border-success/30 px-4 py-3 text-sm text-success">Settings saved.</div>}
      {saveError && <div className="rounded-[4px] bg-red-50 border border-danger/20 px-4 py-3 text-sm text-danger">{saveError}</div>}

      <div className="bg-white border border-border rounded-[4px] px-6">
        <NotifRow
          label="Interview completed"
          description="Email when a candidate completes their interview, with their name and AI score."
          checked={onComplete}
          onChange={setOnComplete}
        />
        <NotifRow
          label="High-score alert"
          description="Email when a candidate scores above a threshold you set."
          checked={onHighScore}
          onChange={setOnHighScore}
        >
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-sub">Notify me when score is above</span>
            <input
              type="number"
              min={50}
              max={100}
              value={scoreThreshold}
              onChange={(e) => setScoreThreshold(Number(e.target.value))}
              className="w-16 bg-white border border-border rounded-[4px] px-2 py-1.5 text-sm text-ink text-center outline-none focus:border-ink transition-colors"
            />
          </div>
        </NotifRow>
        <NotifRow
          label="Weekly hiring summary"
          description="Every Monday: a summary of all interviews from the past week, scores, statuses, top candidates."
          checked={weeklySummary}
          onChange={setWeeklySummary}
        />
      </div>

      <Button className="w-full" size="lg" onClick={handleSave} isLoading={isSaving} loadingText="Saving…">
        <Save className="w-4 h-4" /> Save Notifications
      </Button>
    </div>
  );
}
