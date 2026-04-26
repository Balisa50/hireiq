"use client";

import React, { useState, useCallback, useRef } from "react";
import { Save, AlertTriangle, Trash2, Upload } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { companyAPI } from "@/lib/api";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-border rounded-[4px] p-6 space-y-5">
      <h2 className="text-[11px] font-semibold text-muted uppercase tracking-widest">{title}</h2>
      {children}
    </section>
  );
}

// ── Delete confirmation modal ──────────────────────────────────────────────────
function DeleteModal({ companyName, onClose }: { companyName: string; onClose: () => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 backdrop-blur-sm px-4">
      <div className="bg-white border border-border rounded-[4px] p-8 max-w-md w-full shadow-pop">
        <h2 className="text-base font-semibold text-ink mb-2">Delete account</h2>
        <p className="text-sm text-sub mb-4 leading-relaxed">
          This will permanently delete your account, all jobs, interviews, and candidate reports.
          This action cannot be undone.
        </p>
        <p className="text-sm text-sub mb-3">
          Type <span className="font-mono font-semibold text-ink">{companyName}</span> to confirm:
        </p>
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={companyName} className="mb-4" />
        <div className="flex gap-3">
          <Button variant="danger" disabled={value !== companyName} className="flex-1"
            onClick={() => alert("Account deletion is disabled in this demo.")}>
            <Trash2 className="w-3.5 h-3.5" /> Delete permanently
          </Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

export default function ProfileSettingsPage() {
  const { company, refreshProfile } = useAuth();

  const [companyName, setCompanyName] = useState(company?.company_name ?? "");
  const [industry, setIndustry]       = useState(company?.industry ?? "");
  const [companySize, setCompanySize] = useState(company?.company_size ?? "");
  const [websiteUrl, setWebsiteUrl]   = useState(company?.website_url ?? "");

  const [isSaving, setIsSaving]     = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError]   = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const handleSave = useCallback(async () => {
    setIsSaving(true); setSaveError(""); setSaveSuccess(false);
    try {
      await companyAPI.updateProfile({ company_name: companyName, industry, company_size: companySize, website_url: websiteUrl });
      await refreshProfile();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save.");
    } finally { setIsSaving(false); }
  }, [companyName, industry, companySize, websiteUrl, refreshProfile]);

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-xl font-semibold text-ink">Company Profile</h1>
        <p className="text-sub text-sm mt-1">Your company details and public information.</p>
      </div>

      {saveSuccess && <div className="rounded-[4px] bg-green-50 border border-success/30 px-4 py-3 text-sm text-success">Settings saved.</div>}
      {saveError && <div className="rounded-[4px] bg-red-50 border border-danger/20 px-4 py-3 text-sm text-danger">{saveError}</div>}

      <Section title="Company details">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Input label="Company Name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-ink">Industry</label>
            <input
              list="industry-list"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="e.g. Technology"
              className="w-full bg-white border border-border rounded-[4px] px-3 py-2 text-sm text-ink outline-none focus:border-ink transition-colors placeholder:text-muted"
            />
            <datalist id="industry-list">
              {["Technology", "Finance", "Healthcare", "Education", "Retail", "Manufacturing", "Other"].map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-ink">Company Size</label>
            <select value={companySize} onChange={(e) => setCompanySize(e.target.value)}
              className="w-full bg-white border border-border rounded-[4px] px-3 py-2 text-sm text-ink outline-none focus:border-ink transition-colors appearance-none cursor-pointer">
              <option value="">Select size</option>
              <option value="1-10">1–10 employees</option>
              <option value="11-50">11–50 employees</option>
              <option value="51-200">51–200 employees</option>
              <option value="201-1000">201–1,000 employees</option>
              <option value="1000+">1,000+ employees</option>
            </select>
          </div>
          <Input label="Website URL" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://yourcompany.com" />
        </div>
      </Section>

      <Button className="w-full" size="lg" onClick={handleSave} isLoading={isSaving} loadingText="Saving…">
        <Save className="w-4 h-4" /> Save Profile
      </Button>

      {/* Danger Zone */}
      <section className="border border-danger/25 rounded-[4px] p-6 space-y-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-danger" />
          <h2 className="text-sm font-semibold text-danger">Danger Zone</h2>
        </div>
        <p className="text-sm text-sub">Permanently delete your account and all associated data.</p>
        <Button variant="danger" size="sm" onClick={() => setShowDeleteModal(true)}>
          <Trash2 className="w-3.5 h-3.5" /> Delete Account
        </Button>
      </section>

      {showDeleteModal && (
        <DeleteModal companyName={company?.company_name ?? ""} onClose={() => setShowDeleteModal(false)} />
      )}
    </div>
  );
}
