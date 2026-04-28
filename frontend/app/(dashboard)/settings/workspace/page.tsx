"use client";

import React, { useState, useCallback, useEffect } from "react";
import { Save, Image, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { companyAPI } from "@/lib/api";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

const TIMEZONES = [
  "UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Toronto", "America/Sao_Paulo", "Europe/London", "Europe/Paris", "Europe/Berlin",
  "Europe/Amsterdam", "Africa/Accra", "Africa/Lagos", "Africa/Nairobi", "Africa/Johannesburg",
  "Africa/Banjul", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo",
  "Australia/Sydney",
];

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "fr", label: "French (coming soon)", disabled: true },
  { value: "ar", label: "Arabic (coming soon)", disabled: true },
  { value: "es", label: "Spanish (coming soon)", disabled: true },
];

const INDUSTRIES = [
  "Technology", "Finance", "Healthcare", "Education", "Retail",
  "Manufacturing", "Media", "Legal", "Consulting", "Other",
];

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

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-ink">{children}</label>
      {hint && <p className="text-[12px] text-muted">{hint}</p>}
    </div>
  );
}

export default function WorkspaceSettingsPage() {
  const { company, refreshProfile } = useAuth();

  const [companyName, setCompanyName] = useState(company?.company_name ?? "");
  const [industry, setIndustry]       = useState(company?.industry ?? "");
  const [companySize, setCompanySize] = useState(company?.company_size ?? "");
  const [websiteUrl, setWebsiteUrl]   = useState(company?.website_url ?? "");
  const [timezone, setTimezone]       = useState(company?.timezone ?? "UTC");
  const [language, setLanguage]       = useState(company?.language ?? "en");
  const [logoUrl, setLogoUrl]         = useState(company?.logo_url ?? "");
  const [logoErr, setLogoErr]         = useState(false);

  const [isSaving, setIsSaving]       = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError]     = useState("");
  const [isDirty, setIsDirty]         = useState(false);

  // Sync with loaded company data
  useEffect(() => {
    if (company) {
      setCompanyName(company.company_name);
      setIndustry(company.industry ?? "");
      setCompanySize(company.company_size ?? "");
      setWebsiteUrl(company.website_url ?? "");
      setTimezone(company.timezone ?? "UTC");
      setLanguage(company.language ?? "en");
      setLogoUrl(company.logo_url ?? "");
    }
  }, [company]);

  // Warn on unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const mark = () => setIsDirty(true);

  const handleSave = useCallback(async () => {
    setIsSaving(true); setSaveError(""); setSaveSuccess(false);
    try {
      await companyAPI.updateProfile({
        company_name: companyName,
        industry: industry || null,
        company_size: companySize || null,
        website_url: websiteUrl || null,
        logo_url: logoUrl || null,
        timezone,
        language,
      });
      await refreshProfile();
      setSaveSuccess(true);
      setIsDirty(false);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save.");
    } finally { setIsSaving(false); }
  }, [companyName, industry, companySize, websiteUrl, logoUrl, timezone, language, refreshProfile]);

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-xl font-semibold text-ink">General</h1>
        <p className="text-sub text-sm mt-1">Your workspace identity and regional settings.</p>
      </div>

      {saveSuccess && (
        <div className="rounded-[4px] bg-green-50 border border-success/30 px-4 py-3 text-sm text-success">
          Changes saved.
        </div>
      )}
      {saveError && (
        <div className="rounded-[4px] bg-red-50 border border-danger/20 px-4 py-3 text-sm text-danger">
          {saveError}
        </div>
      )}

      {/* Account */}
      <Section title="Account">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-ink">Email address</label>
          <div className="w-full bg-[var(--bg)] border border-border rounded-[4px] px-3 py-2 text-sm text-sub cursor-not-allowed select-none">
            {company?.email ?? "—"}
          </div>
          <p className="text-[12px] text-muted">Contact support to change your email address.</p>
        </div>
      </Section>

      {/* Company details */}
      <Section title="Company details">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Input
            label="Company Name"
            value={companyName}
            onChange={(e) => { setCompanyName(e.target.value); mark(); }}
            required
          />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-ink">Industry</label>
            <input
              list="industry-list"
              value={industry}
              onChange={(e) => { setIndustry(e.target.value); mark(); }}
              placeholder="e.g. Technology"
              className="w-full bg-white border border-border rounded-[4px] px-3 py-2 text-sm text-ink outline-none focus:border-ink transition-colors placeholder:text-muted"
            />
            <datalist id="industry-list">
              {INDUSTRIES.map((v) => <option key={v} value={v} />)}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-ink">Company Size</label>
            <select
              value={companySize}
              onChange={(e) => { setCompanySize(e.target.value); mark(); }}
              className="w-full bg-white border border-border rounded-[4px] px-3 py-2 text-sm text-ink outline-none focus:border-ink transition-colors appearance-none cursor-pointer"
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
            onChange={(e) => { setWebsiteUrl(e.target.value); mark(); }}
            placeholder="https://yourcompany.com"
          />
        </div>
      </Section>

      {/* Logo */}
      <Section title="Logo" description="Shown on your candidate application pages.">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-ink">Logo URL</label>
            <input
              type="url"
              value={logoUrl}
              onChange={(e) => { setLogoUrl(e.target.value); setLogoErr(false); mark(); }}
              placeholder="https://yourcompany.com/logo.png"
              className="w-full bg-white border border-border rounded-[4px] px-3 py-2 text-sm text-ink outline-none focus:border-ink transition-colors placeholder:text-muted"
            />
            <p className="text-[12px] text-muted">PNG or SVG, square format recommended.</p>
          </div>
          {logoUrl && !logoErr && (
            <div className="flex items-center gap-3 p-3 bg-[var(--bg)] border border-border rounded-[4px]">
              <Image className="w-4 h-4 text-muted shrink-0" />
              <span className="text-[13px] text-sub flex-1">Preview</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt="Logo preview"
                className="h-10 max-w-[120px] object-contain rounded"
                onError={() => setLogoErr(true)}
              />
              <button onClick={() => { setLogoUrl(""); mark(); }} className="text-muted hover:text-danger transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          {logoErr && (
            <p className="text-[12px] text-danger">Could not load image. Check the URL is publicly accessible.</p>
          )}
        </div>
      </Section>

      {/* Regional */}
      <Section title="Regional settings">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-ink">Timezone</label>
            <select
              value={timezone}
              onChange={(e) => { setTimezone(e.target.value); mark(); }}
              className="w-full bg-white border border-border rounded-[4px] px-3 py-2 text-sm text-ink outline-none focus:border-ink transition-colors appearance-none cursor-pointer"
            >
              {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>)}
            </select>
            <p className="text-[12px] text-muted">Used for deadline calculations and email timestamps.</p>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-ink">Language</label>
            <select
              value={language}
              onChange={(e) => { setLanguage(e.target.value); mark(); }}
              className="w-full bg-white border border-border rounded-[4px] px-3 py-2 text-sm text-ink outline-none focus:border-ink transition-colors appearance-none cursor-pointer"
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value} disabled={l.disabled}>{l.label}</option>
              ))}
            </select>
          </div>
        </div>
      </Section>

      <Button
        className="w-full"
        size="lg"
        onClick={handleSave}
        isLoading={isSaving}
        loadingText="Saving…"
      >
        <Save className="w-4 h-4" /> Save Changes
      </Button>
    </div>
  );
}
