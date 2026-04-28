"use client";

import React, { useState, useCallback, useEffect } from "react";
import { Save, Eye } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { companyAPI } from "@/lib/api";
import Button from "@/components/ui/Button";

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

// Live preview of the candidate-facing apply page
function CandidatePreview({
  companyName,
  logoUrl,
  brandColor,
  welcomeMessage,
  closingMessage,
}: {
  companyName: string;
  logoUrl?: string | null;
  brandColor: string;
  welcomeMessage: string;
  closingMessage: string;
}) {
  const [imgErr, setImgErr] = useState(false);
  useEffect(() => { setImgErr(false); }, [logoUrl]);

  return (
    <div className="border border-border rounded-[4px] overflow-hidden">
      <div className="bg-[var(--bg)] border-b border-border px-4 py-2.5 flex items-center gap-2">
        <Eye className="w-3.5 h-3.5 text-muted shrink-0" />
        <span className="text-[12px] text-muted font-medium">Candidate page preview</span>
      </div>

      {/* Mock apply page */}
      <div className="bg-[var(--bg)] p-5 space-y-4 text-[13px]">
        <div className="flex items-center gap-3">
          {logoUrl && !imgErr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="logo"
              className="h-8 w-8 object-contain rounded"
              onError={() => setImgErr(true)}
            />
          ) : (
            <div
              className="h-8 w-8 rounded flex items-center justify-center text-white text-xs font-bold shrink-0"
              style={{ backgroundColor: brandColor }}
            >
              {companyName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <span className="font-semibold text-ink">{companyName || "Your Company"}</span>
        </div>

        <div className="bg-white border border-border rounded-[4px] p-4 space-y-2">
          <p className="font-semibold text-ink text-sm">Software Engineer</p>
          <p className="text-sub text-[12px]">Full Time · London, UK · Closes 30 May 2025</p>
        </div>

        {welcomeMessage && (
          <div
            className="p-3 rounded-[4px] text-[13px] border-l-2 bg-white border-border"
            style={{ borderLeftColor: brandColor }}
          >
            <p className="text-sub">{welcomeMessage}</p>
          </div>
        )}

        <button
          className="w-full py-2.5 rounded-[4px] text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: brandColor }}
        >
          Begin Application
        </button>

        {closingMessage && (
          <p className="text-[12px] text-muted text-center">{closingMessage}</p>
        )}
      </div>
    </div>
  );
}

const PRESET_COLORS = [
  "#1A1714", "#1D4ED8", "#7C3AED", "#059669", "#DC2626",
  "#EA580C", "#0891B2", "#0F766E", "#9F1239", "#374151",
];

export default function BrandingSettingsPage() {
  const { company, refreshProfile } = useAuth();

  const [brandColor,      setBrandColor]      = useState(company?.brand_color ?? "#1A1714");
  const [welcomeMessage,  setWelcomeMessage]  = useState(company?.custom_intro_message ?? "");
  const [closingMessage,  setClosingMessage]  = useState(company?.closing_message ?? "");
  const [logoUrl,         setLogoUrl]         = useState(company?.logo_url ?? "");

  const [isSaving, setIsSaving]       = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError]     = useState("");

  useEffect(() => {
    if (company) {
      setBrandColor(company.brand_color ?? "#1A1714");
      setWelcomeMessage(company.custom_intro_message ?? "");
      setClosingMessage(company.closing_message ?? "");
      setLogoUrl(company.logo_url ?? "");
    }
  }, [company]);

  const handleSave = useCallback(async () => {
    setIsSaving(true); setSaveError(""); setSaveSuccess(false);
    try {
      await companyAPI.updateProfile({
        brand_color:          brandColor,
        custom_intro_message: welcomeMessage || null,
        closing_message:      closingMessage || null,
        logo_url:             logoUrl || null,
      });
      await refreshProfile();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save.");
    } finally { setIsSaving(false); }
  }, [brandColor, welcomeMessage, closingMessage, logoUrl, refreshProfile]);

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-xl font-semibold text-ink">Branding</h1>
        <p className="text-sub text-sm mt-1">Customise how your company looks to candidates.</p>
      </div>

      {saveSuccess && (
        <div className="rounded-[4px] bg-green-50 border border-success/30 px-4 py-3 text-sm text-success">
          Branding saved.
        </div>
      )}
      {saveError && (
        <div className="rounded-[4px] bg-red-50 border border-danger/20 px-4 py-3 text-sm text-danger">
          {saveError}
        </div>
      )}

      {/* Color */}
      <Section title="Brand color" description="Used for buttons and accents on your candidate-facing pages.">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setBrandColor(c)}
                className="w-8 h-8 rounded-full transition-all border-2"
                style={{
                  backgroundColor: c,
                  borderColor: brandColor === c ? c : "transparent",
                  outline: brandColor === c ? `3px solid ${c}40` : "none",
                  outlineOffset: "2px",
                }}
                title={c}
              />
            ))}
          </div>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              className="w-10 h-10 rounded-[4px] border border-border cursor-pointer bg-white"
            />
            <input
              type="text"
              value={brandColor}
              onChange={(e) => {
                const v = e.target.value;
                if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) setBrandColor(v);
              }}
              maxLength={7}
              className="w-28 bg-white border border-border rounded-[4px] px-3 py-2 text-sm text-ink font-mono outline-none focus:border-ink transition-colors"
            />
          </div>
        </div>
      </Section>

      {/* Messages */}
      <Section title="Application messages">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-ink">Welcome message</label>
            <textarea
              value={welcomeMessage}
              onChange={(e) => setWelcomeMessage(e.target.value)}
              rows={3}
              placeholder="E.g. 'Thank you for applying. This interview takes around 20 minutes and covers your experience and goals.'"
              className="w-full bg-white border border-border rounded-[4px] px-4 py-3 text-sm text-ink outline-none resize-none placeholder:text-muted transition-colors focus:border-ink"
              maxLength={1000}
            />
            <p className="text-[13px] text-muted text-right">{welcomeMessage.length}/1000</p>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-ink">Closing message</label>
            <textarea
              value={closingMessage}
              onChange={(e) => setClosingMessage(e.target.value)}
              rows={2}
              placeholder="E.g. 'We review every application carefully and will be in touch within 5 business days.'"
              className="w-full bg-white border border-border rounded-[4px] px-4 py-3 text-sm text-ink outline-none resize-none placeholder:text-muted transition-colors focus:border-ink"
              maxLength={500}
            />
            <p className="text-[13px] text-muted text-right">{closingMessage.length}/500</p>
          </div>
        </div>
      </Section>

      {/* Live preview */}
      <Section title="Live preview">
        <CandidatePreview
          companyName={company?.company_name ?? "Your Company"}
          logoUrl={logoUrl}
          brandColor={brandColor}
          welcomeMessage={welcomeMessage}
          closingMessage={closingMessage}
        />
      </Section>

      <Button className="w-full" size="lg" onClick={handleSave} isLoading={isSaving} loadingText="Saving…">
        <Save className="w-4 h-4" /> Save Branding
      </Button>
    </div>
  );
}
