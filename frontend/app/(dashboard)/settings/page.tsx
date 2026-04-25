"use client";

import React, { useState, useCallback } from "react";
import { Save, AlertTriangle, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { companyAPI } from "@/lib/api";
import { FOCUS_AREAS } from "@/lib/types";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

export default function SettingsPage() {
  const { company, refreshProfile } = useAuth();

  const [companyName, setCompanyName]               = useState(company?.company_name ?? "");
  const [industry, setIndustry]                     = useState(company?.industry ?? "");
  const [companySize, setCompanySize]               = useState(company?.company_size ?? "");
  const [websiteUrl, setWebsiteUrl]                 = useState(company?.website_url ?? "");
  const [defaultQuestionCount, setDefaultQuestionCount] = useState(
    company?.default_question_count ?? 8,
  );
  const [defaultFocusAreas, setDefaultFocusAreas]   = useState<string[]>(
    company?.default_focus_areas ?? [],
  );
  const [customIntroMessage, setCustomIntroMessage] = useState(
    company?.custom_intro_message ?? "",
  );
  const [emailNotifications, setEmailNotifications] = useState(
    company?.email_notifications ?? true,
  );

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [showDeleteZone, setShowDeleteZone] = useState(false);

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
    <div className="max-w-2xl mx-auto space-y-8 animate-fade-in pb-12">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-[var(--text-muted)] text-sm mt-1">
          Manage your company profile and interview defaults.
        </p>
      </div>

      {saveSuccess && (
        <div className="rounded-xl bg-green-500/10 border border-green-500/20 px-4 py-3 text-sm text-green-400">
          Settings saved successfully.
        </div>
      )}
      {saveError && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {saveError}
        </div>
      )}

      {/* Company Profile */}
      <section className="glass rounded-2xl p-6 space-y-5">
        <h2 className="text-sm font-semibold text-white">Company Profile</h2>
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
            <label className="block text-sm font-medium text-[var(--text-muted)]">
              Company Size
            </label>
            <select
              value={companySize}
              onChange={(e) => setCompanySize(e.target.value)}
              className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-[var(--text)] text-sm outline-none focus:border-brand-500 transition-colors"
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
            type="url"
          />
        </div>
      </section>

      {/* Interview Defaults */}
      <section className="glass rounded-2xl p-6 space-y-5">
        <h2 className="text-sm font-semibold text-white">Interview Defaults</h2>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-[var(--text-muted)]">
              Default Number of Questions
            </label>
            <span className="text-sm font-bold text-brand-400">{defaultQuestionCount}</span>
          </div>
          <input
            type="range"
            min={5}
            max={15}
            value={defaultQuestionCount}
            onChange={(e) => setDefaultQuestionCount(Number(e.target.value))}
            className="w-full accent-blue-500"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-[var(--text-muted)]">
            Default Focus Areas
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {FOCUS_AREAS.map((area) => {
              const selected = defaultFocusAreas.includes(area);
              return (
                <button
                  key={area}
                  type="button"
                  onClick={() => toggleFocusArea(area)}
                  className={`px-3 py-2.5 rounded-xl text-xs font-medium text-left transition-all border ${
                    selected
                      ? "bg-brand-500/15 border-brand-500/40 text-brand-300"
                      : "border-[var(--border)] text-[var(--text-muted)] hover:border-white/15"
                  }`}
                >
                  {area}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-[var(--text-muted)]">
            Custom Intro Message for Candidates
          </label>
          <textarea
            value={customIntroMessage}
            onChange={(e) => setCustomIntroMessage(e.target.value)}
            rows={3}
            placeholder="Optional message shown to candidates before they start their interview. e.g. 'Thank you for applying to Acme Corp. This interview will take approximately 20 minutes.'"
            className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--text)] text-sm outline-none resize-none placeholder:text-[var(--text-dim)] focus:border-brand-500 transition-colors"
            maxLength={1000}
          />
          <p className="text-xs text-[var(--text-dim)] text-right">
            {customIntroMessage.length}/1000
          </p>
        </div>
      </section>

      {/* Notifications */}
      <section className="glass rounded-2xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-white">Notifications</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--text)]">
              Email when a candidate completes an interview
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Receive an email notification with the candidate&apos;s name and score.
            </p>
          </div>
          <button
            onClick={() => setEmailNotifications((v) => !v)}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              emailNotifications ? "bg-brand-500" : "bg-white/15"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                emailNotifications ? "translate-x-6" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </section>

      {/* Save */}
      <Button
        className="w-full"
        size="lg"
        onClick={handleSave}
        isLoading={isSaving}
        loadingText="Saving..."
      >
        <Save className="w-4 h-4" /> Save Settings
      </Button>

      {/* Danger Zone */}
      <section className="rounded-2xl border border-red-500/20 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <h2 className="text-sm font-semibold text-red-400">Danger Zone</h2>
        </div>
        {!showDeleteZone ? (
          <Button variant="danger" size="sm" onClick={() => setShowDeleteZone(true)}>
            <Trash2 className="w-3.5 h-3.5" /> Delete Account
          </Button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-[var(--text-muted)]">
              This will permanently delete your account and all associated data including jobs,
              interviews, and candidate reports. This action cannot be undone.
            </p>
            <p className="text-sm text-[var(--text-muted)]">
              Type <span className="font-mono text-white">{company?.company_name}</span> to confirm:
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
                <Trash2 className="w-3.5 h-3.5" /> Permanently Delete Account
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
