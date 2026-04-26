"use client";

import React, { useState, useCallback } from "react";
import { Save, AlertTriangle, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { companyAPI } from "@/lib/api";
import { FOCUS_AREAS } from "@/lib/types";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

// ── Toggle switch ─────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2 ${
        checked ? "bg-ink" : "bg-border"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-border rounded-[4px] p-6 space-y-5">
      <h2 className="text-[11px] font-semibold text-muted uppercase tracking-widest">
        {title}
      </h2>
      {children}
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { company, refreshProfile } = useAuth();

  const [companyName, setCompanyName]           = useState(company?.company_name ?? "");
  const [industry, setIndustry]                 = useState(company?.industry ?? "");
  const [companySize, setCompanySize]           = useState(company?.company_size ?? "");
  const [websiteUrl, setWebsiteUrl]             = useState(company?.website_url ?? "");
  const [defaultQuestionCount, setDefaultQuestionCount] = useState(
    company?.default_question_count ?? 8,
  );
  const [defaultFocusAreas, setDefaultFocusAreas] = useState<string[]>(
    company?.default_focus_areas ?? [],
  );
  const [customIntroMessage, setCustomIntroMessage] = useState(
    company?.custom_intro_message ?? "",
  );
  const [emailNotifications, setEmailNotifications] = useState(
    company?.email_notifications ?? true,
  );

  const [isSaving, setIsSaving]         = useState(false);
  const [saveSuccess, setSaveSuccess]   = useState(false);
  const [saveError, setSaveError]       = useState("");
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [showDeleteZone, setShowDeleteZone]       = useState(false);

  const toggleFocusArea = useCallback((area: string) => {
    setDefaultFocusAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area],
    );
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setSaveError("");
    setSaveSuccess(false);
    try {
      await companyAPI.updateProfile({
        company_name: companyName,
        industry,
        company_size: companySize,
        website_url: websiteUrl,
        default_question_count: defaultQuestionCount,
        default_focus_areas: defaultFocusAreas,
        custom_intro_message: customIntroMessage,
        email_notifications: emailNotifications,
      });
      await refreshProfile();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save settings.");
    } finally {
      setIsSaving(false);
    }
  }, [
    companyName, industry, companySize, websiteUrl,
    defaultQuestionCount, defaultFocusAreas, customIntroMessage,
    emailNotifications, refreshProfile,
  ]);

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-ink">Settings</h1>
        <p className="text-sub text-sm mt-1">
          Manage your company profile and interview defaults.
        </p>
      </div>

      {/* Feedback banners */}
      {saveSuccess && (
        <div className="rounded-[4px] bg-green-50 border border-success/30 px-4 py-3 text-sm text-success">
          Settings saved.
        </div>
      )}
      {saveError && (
        <div className="rounded-[4px] bg-red-50 border border-danger/20 px-4 py-3 text-sm text-danger">
          {saveError}
        </div>
      )}

      {/* ── Company Profile ── */}
      <Section title="Company Profile">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Input
            label="Company Name"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            required
          />
          <Input
            label="Industry"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="e.g. Technology, Finance, Healthcare"
          />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-ink">
              Company Size
            </label>
            <select
              value={companySize}
              onChange={(e) => setCompanySize(e.target.value)}
              className="w-full bg-white border border-border rounded-[4px] px-3 py-2 text-sm text-ink outline-none focus:border-ink transition-colors cursor-pointer appearance-none"
            >
              <option value="">Select size</option>
              <option value="1-10">1–10 employees</option>
              <option value="11-50">11–50 employees</option>
              <option value="51-200">51–200 employees</option>
              <option value="201-1000">201–1,000 employees</option>
              <option value="1000+">1,000+ employees</option>
            </select>
          </div>
          <Input
            label="Website URL"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://yourcompany.com"
          />
        </div>
      </Section>

      {/* ── Interview Defaults ── */}
      <Section title="Interview Defaults">
        {/* Question count */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-ink">
              Default number of questions
            </label>
            <span className="text-sm font-semibold text-ink tabular-nums">
              {defaultQuestionCount}
            </span>
          </div>
          <input
            type="range"
            min={5}
            max={15}
            value={defaultQuestionCount}
            onChange={(e) => setDefaultQuestionCount(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-[13px] text-muted">
            <span>5 — Quick screen</span>
            <span>15 — In-depth</span>
          </div>
        </div>

        {/* Focus areas */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-ink">
            Default focus areas
          </label>
          <div className="flex flex-wrap gap-2">
            {FOCUS_AREAS.map((area) => {
              const selected = defaultFocusAreas.includes(area);
              return (
                <button
                  key={area}
                  type="button"
                  onClick={() => toggleFocusArea(area)}
                  className={`px-3 py-1.5 rounded-[4px] text-[13px] font-medium transition-all border ${
                    selected
                      ? "bg-ink text-white border-ink"
                      : "bg-white text-sub border-border hover:border-ink hover:text-ink"
                  }`}
                >
                  {area}
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom intro message */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-ink">
            Custom intro message for candidates
          </label>
          <textarea
            value={customIntroMessage}
            onChange={(e) => setCustomIntroMessage(e.target.value)}
            rows={3}
            placeholder="Optional message shown before candidates start. e.g. 'Thank you for applying — this interview takes around 20 minutes.'"
            className="w-full bg-white border border-border rounded-[4px] px-4 py-3 text-sm text-ink outline-none resize-none placeholder:text-muted transition-colors focus:border-ink"
            maxLength={1000}
          />
          <p className="text-[13px] text-muted text-right">
            {customIntroMessage.length}/1000
          </p>
        </div>
      </Section>

      {/* ── Notifications ── */}
      <Section title="Notifications">
        <div className="flex items-center justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-ink">
              Email when a candidate completes an interview
            </p>
            <p className="text-[13px] text-sub mt-0.5">
              Receive a notification with the candidate&apos;s name and AI score.
            </p>
          </div>
          <Toggle
            checked={emailNotifications}
            onChange={setEmailNotifications}
          />
        </div>
      </Section>

      {/* ── Save ── */}
      <Button
        className="w-full"
        size="lg"
        onClick={handleSave}
        isLoading={isSaving}
        loadingText="Saving…"
      >
        <Save className="w-4 h-4" /> Save Settings
      </Button>

      {/* ── Danger Zone ── */}
      <section className="border border-danger/25 rounded-[4px] p-6 space-y-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-danger" />
          <h2 className="text-sm font-semibold text-danger">Danger Zone</h2>
        </div>

        {!showDeleteZone ? (
          <Button variant="danger" size="sm" onClick={() => setShowDeleteZone(true)}>
            <Trash2 className="w-3.5 h-3.5" /> Delete Account
          </Button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-sub">
              This will permanently delete your account and all data — jobs, interviews, and
              candidate reports. This cannot be undone.
            </p>
            <p className="text-sm text-sub">
              Type{" "}
              <span className="font-mono text-ink font-medium">
                {company?.company_name}
              </span>{" "}
              to confirm:
            </p>
            <Input
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              placeholder={company?.company_name ?? "Company name"}
            />
            <div className="flex gap-2">
              <Button
                variant="danger"
                disabled={deleteConfirmName !== company?.company_name}
                onClick={() => alert("Account deletion is disabled in this demo.")}
              >
                <Trash2 className="w-3.5 h-3.5" /> Permanently Delete
              </Button>
              <Button variant="ghost" onClick={() => setShowDeleteZone(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
