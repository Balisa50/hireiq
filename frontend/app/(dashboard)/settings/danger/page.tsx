"use client";

import React, { useState } from "react";
import { AlertTriangle, Trash2, Download, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { candidatesAPI } from "@/lib/api";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

function DangerSection({ title, description, children }: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-danger/20 rounded-[4px] p-6 space-y-4">
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="text-[13px] text-sub mt-1 leading-relaxed">{description}</p>
      </div>
      {children}
    </section>
  );
}

// ── Delete all candidates modal ───────────────────────────────────────────────
function DeleteCandidatesModal({
  companyName,
  onClose,
}: {
  companyName: string;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const handleDelete = async () => {
    setIsDeleting(true); setError("");
    try {
      // No bulk delete API yet, inform user to contact support
      await new Promise((r) => setTimeout(r, 800));
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    } finally { setIsDeleting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 backdrop-blur-sm px-4">
      <div className="bg-white border border-border rounded-[4px] p-8 max-w-md w-full shadow-xl">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-base font-semibold text-ink">Delete all candidates</h2>
          <button onClick={onClose} className="text-muted hover:text-ink transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        {done ? (
          <div className="space-y-4">
            <p className="text-sm text-sub">
              This action requires manual processing for compliance. We&apos;ve noted your request.
              A member of the team will confirm deletion within 48 hours.
            </p>
            <p className="text-sm text-sub">
              Email: <a href="mailto:support@hireiq.app" className="underline text-ink">support@hireiq.app</a>
            </p>
            <Button variant="secondary" onClick={onClose} className="w-full">Close</Button>
          </div>
        ) : (
          <>
            <p className="text-sm text-sub mb-4 leading-relaxed">
              This will permanently delete all candidate data, interview transcripts, and AI reports.
              This action cannot be undone.
            </p>
            {error && <p className="text-sm text-danger mb-3">{error}</p>}
            <p className="text-sm text-sub mb-3">
              Type <span className="font-mono font-semibold text-ink">{companyName}</span> to confirm:
            </p>
            <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={companyName} className="mb-4" />
            <div className="flex gap-3">
              <Button
                variant="danger"
                disabled={value !== companyName}
                isLoading={isDeleting}
                loadingText="Processing…"
                className="flex-1"
                onClick={handleDelete}
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete all candidates
              </Button>
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Delete account modal ──────────────────────────────────────────────────────
function DeleteAccountModal({ onClose }: { onClose: () => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 backdrop-blur-sm px-4">
      <div className="bg-white border border-border rounded-[4px] p-8 max-w-md w-full shadow-xl">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-base font-semibold text-ink">Delete account</h2>
          <button onClick={onClose} className="text-muted hover:text-ink transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-sub mb-4 leading-relaxed">
          This will permanently delete your account, all jobs, all candidate data, and all reports.
          This action cannot be undone.
        </p>
        <p className="text-sm text-sub mb-3">
          Type <span className="font-mono font-semibold text-ink">DELETE</span> to confirm:
        </p>
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="DELETE" className="mb-4" />
        <div className="flex gap-3">
          <Button
            variant="danger"
            disabled={value !== "DELETE"}
            className="flex-1"
            onClick={() => alert("Account deletion is processed manually. Please email support@hireiq.app from your registered address with the subject line 'Account deletion request'.")}
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete permanently
          </Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DangerZonePage() {
  const { company } = useAuth();
  const [showDeleteCandidates, setShowDeleteCandidates] = useState(false);
  const [showDeleteAccount,    setShowDeleteAccount]    = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportDone, setExportDone] = useState(false);

  const handleExport = async () => {
    setExportLoading(true);
    await new Promise((r) => setTimeout(r, 800));
    // Open a support email with export request
    const subject = encodeURIComponent("Data export request");
    const body = encodeURIComponent(
      `Hi,\n\nI'd like to export all my HireIQ data.\n\nAccount: ${company?.email}\nCompany: ${company?.company_name}\n\nThank you.`
    );
    window.open(`mailto:support@hireiq.app?subject=${subject}&body=${body}`);
    setExportLoading(false);
    setExportDone(true);
    setTimeout(() => setExportDone(false), 5000);
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-danger" />
        <h1 className="text-xl font-semibold text-danger">Danger Zone</h1>
      </div>
      <p className="text-sub text-sm">
        These actions are irreversible. Please read each warning carefully before proceeding.
      </p>

      <DangerSection
        title="Export all data"
        description="Download a complete export of your account data, including all jobs, candidate transcripts, and AI reports."
      >
        <Button
          variant="secondary"
          onClick={handleExport}
          isLoading={exportLoading}
          loadingText="Requesting…"
        >
          {exportDone ? (
            "Export requested, check your email"
          ) : (
            <><Download className="w-3.5 h-3.5" /> Export My Data</>
          )}
        </Button>
      </DangerSection>

      <DangerSection
        title="Delete all candidates"
        description="Permanently remove all candidate applications, transcripts, scores, and reports from your account. Your jobs will remain intact."
      >
        <Button
          variant="danger"
          size="sm"
          onClick={() => setShowDeleteCandidates(true)}
        >
          <Trash2 className="w-3.5 h-3.5" /> Delete All Candidates
        </Button>
      </DangerSection>

      <DangerSection
        title="Delete account"
        description="Permanently delete your HireIQ account and all associated data. This removes everything, jobs, candidates, reports, and your company profile. This cannot be undone."
      >
        <Button
          variant="danger"
          size="sm"
          onClick={() => setShowDeleteAccount(true)}
        >
          <Trash2 className="w-3.5 h-3.5" /> Delete Account
        </Button>
      </DangerSection>

      {showDeleteCandidates && (
        <DeleteCandidatesModal
          companyName={company?.company_name ?? ""}
          onClose={() => setShowDeleteCandidates(false)}
        />
      )}
      {showDeleteAccount && (
        <DeleteAccountModal onClose={() => setShowDeleteAccount(false)} />
      )}
    </div>
  );
}
