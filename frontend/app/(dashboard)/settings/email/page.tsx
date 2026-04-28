"use client";

import React, { useState, useCallback, useEffect } from "react";
import { Save, Send, Eye } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { companyAPI } from "@/lib/api";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

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

function EmailPreview({
  senderName,
  replyTo,
  signature,
  footer,
  companyName,
  logoUrl,
}: {
  senderName: string;
  replyTo: string;
  signature: string;
  footer: string;
  companyName: string;
  logoUrl?: string | null;
}) {
  const from = senderName || companyName || "HireIQ";
  const preview = signature || `Thank you for your application. We'll be in touch with next steps.`;
  return (
    <div className="border border-border rounded-[4px] overflow-hidden text-[13px]">
      <div className="bg-[var(--bg)] border-b border-border px-4 py-2.5 flex items-center gap-3">
        <Eye className="w-3.5 h-3.5 text-muted shrink-0" />
        <span className="text-[12px] text-muted font-medium">Email preview</span>
      </div>
      <div className="p-5 space-y-3 bg-white">
        <div className="text-[12px] text-muted space-y-1">
          <p><span className="font-medium">From:</span> {from} &lt;noreply@hireiq.app&gt;</p>
          {replyTo && <p><span className="font-medium">Reply-To:</span> {replyTo}</p>}
          <p><span className="font-medium">Subject:</span> Your application has been received</p>
        </div>
        <div className="border-t border-border pt-3 space-y-3">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="logo" className="h-8 object-contain" />
          )}
          <p className="text-ink">Hi [Candidate name],</p>
          <p className="text-sub leading-relaxed">{preview}</p>
          {footer && (
            <p className="text-muted text-[12px] border-t border-border pt-3">{footer}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function EmailSettingsPage() {
  const { company, refreshProfile } = useAuth();

  const [senderName, setSenderName]   = useState(company?.sender_name ?? "");
  const [replyTo, setReplyTo]         = useState(company?.reply_to_email ?? "");
  const [footer, setFooter]           = useState(company?.email_footer ?? "");
  const [signature, setSignature]     = useState(company?.email_signature ?? "");

  const [isSaving, setIsSaving]       = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError]     = useState("");
  const [testSent, setTestSent]       = useState(false);

  useEffect(() => {
    if (company) {
      setSenderName(company.sender_name ?? "");
      setReplyTo(company.reply_to_email ?? "");
      setFooter(company.email_footer ?? "");
      setSignature(company.email_signature ?? "");
    }
  }, [company]);

  const handleSave = useCallback(async () => {
    setIsSaving(true); setSaveError(""); setSaveSuccess(false);
    try {
      await companyAPI.updateProfile({
        sender_name:    senderName || null,
        reply_to_email: replyTo || null,
        email_footer:   footer || null,
        email_signature: signature || null,
      });
      await refreshProfile();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save.");
    } finally { setIsSaving(false); }
  }, [senderName, replyTo, footer, signature, refreshProfile]);

  const handleTestSend = () => {
    if (!company?.email) return;
    const subject = encodeURIComponent("Test email from HireIQ");
    const body = encodeURIComponent(
      `Hi,\n\nThis is a test email from your HireIQ account.\n\nSender name: ${senderName || company.company_name}\nReply-to: ${replyTo || "(not set)"}\n\nIf you received this, your email settings are configured correctly.\n\nHireIQ`
    );
    window.open(`mailto:${company.email}?subject=${subject}&body=${body}`);
    setTestSent(true);
    setTimeout(() => setTestSent(false), 4000);
  };

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-xl font-semibold text-ink">Email</h1>
        <p className="text-sub text-sm mt-1">Customise how outgoing emails appear to candidates.</p>
      </div>

      {saveSuccess && (
        <div className="rounded-[4px] bg-green-50 border border-success/30 px-4 py-3 text-sm text-success">
          Email settings saved.
        </div>
      )}
      {saveError && (
        <div className="rounded-[4px] bg-red-50 border border-danger/20 px-4 py-3 text-sm text-danger">
          {saveError}
        </div>
      )}

      <Section title="Sender identity" description="How your emails appear in candidates' inboxes.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-ink">Sender name</label>
            <input
              type="text"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              placeholder={company?.company_name ?? "Your company name"}
              maxLength={100}
              className="w-full bg-white border border-border rounded-[4px] px-3 py-2 text-sm text-ink outline-none focus:border-ink transition-colors placeholder:text-muted"
            />
            <p className="text-[12px] text-muted">Shown as "From: [name]" in email clients.</p>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-ink">Reply-to email</label>
            <input
              type="email"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              placeholder={company?.email ?? "hr@yourcompany.com"}
              className="w-full bg-white border border-border rounded-[4px] px-3 py-2 text-sm text-ink outline-none focus:border-ink transition-colors placeholder:text-muted"
            />
            <p className="text-[12px] text-muted">Candidates who reply will reach this address.</p>
          </div>
        </div>
      </Section>

      <Section title="Email content" description="Custom copy appended to every outgoing email.">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-ink">Default signature / closing line</label>
            <textarea
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              rows={3}
              placeholder="Best regards, the Hiring Team at Acme Corp."
              maxLength={500}
              className="w-full bg-white border border-border rounded-[4px] px-4 py-3 text-sm text-ink outline-none resize-none placeholder:text-muted transition-colors focus:border-ink"
            />
            <p className="text-[13px] text-muted text-right">{signature.length}/500</p>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-ink">Footer text</label>
            <textarea
              value={footer}
              onChange={(e) => setFooter(e.target.value)}
              rows={2}
              placeholder="© 2025 Acme Corp. · Unsubscribe · Privacy Policy"
              maxLength={300}
              className="w-full bg-white border border-border rounded-[4px] px-4 py-3 text-sm text-ink outline-none resize-none placeholder:text-muted transition-colors focus:border-ink"
            />
            <p className="text-[13px] text-muted text-right">{footer.length}/300</p>
          </div>
        </div>
      </Section>

      {/* Live preview */}
      <Section title="Preview">
        <EmailPreview
          senderName={senderName}
          replyTo={replyTo}
          signature={signature}
          footer={footer}
          companyName={company?.company_name ?? "Your Company"}
          logoUrl={company?.logo_url}
        />
      </Section>

      <div className="flex gap-3">
        <Button
          className="flex-1"
          size="lg"
          onClick={handleSave}
          isLoading={isSaving}
          loadingText="Saving…"
        >
          <Save className="w-4 h-4" /> Save Email Settings
        </Button>
        <Button
          variant="secondary"
          size="lg"
          onClick={handleTestSend}
        >
          {testSent ? "Email opened!" : <><Send className="w-4 h-4" /> Test Send</>}
        </Button>
      </div>
    </div>
  );
}
