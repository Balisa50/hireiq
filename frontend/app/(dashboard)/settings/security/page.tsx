"use client";

import React, { useState, useCallback } from "react";
import { Shield, Eye, EyeOff, Lock, Smartphone, Monitor, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { authAPI } from "@/lib/api";
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

function PasswordInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-ink">{label}</label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-white border border-border rounded-[4px] px-3 py-2 pr-10 text-sm text-ink outline-none focus:border-ink transition-colors placeholder:text-muted"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition-colors"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

const REQUIREMENTS = [
  { test: (p: string) => p.length >= 12,           label: "At least 12 characters" },
  { test: (p: string) => /[A-Z]/.test(p),          label: "One uppercase letter" },
  { test: (p: string) => /[a-z]/.test(p),          label: "One lowercase letter" },
  { test: (p: string) => /\d/.test(p),             label: "One number" },
  { test: (p: string) => /[!@#$%^&*()_+\-=[\]{}|;':",./<>?]/.test(p), label: "One special character" },
];

export default function SecuritySettingsPage() {
  const { company, logout } = useAuth();

  const [currentPw,  setCurrentPw]  = useState("");
  const [newPw,      setNewPw]      = useState("");
  const [confirmPw,  setConfirmPw]  = useState("");
  const [isChanging, setIsChanging] = useState(false);
  const [pwSuccess,  setPwSuccess]  = useState(false);
  const [pwError,    setPwError]    = useState("");

  const newPwStrength = REQUIREMENTS.filter((r) => r.test(newPw));
  const allPassing = newPwStrength.length === REQUIREMENTS.length && newPw === confirmPw && currentPw.length > 0;

  const handleChangePassword = useCallback(async () => {
    if (!allPassing) return;
    setIsChanging(true); setPwError(""); setPwSuccess(false);
    try {
      await authAPI.changePassword(currentPw, newPw);
      setPwSuccess(true);
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
      setTimeout(() => setPwSuccess(false), 4000);
    } catch (e) {
      setPwError(e instanceof Error ? e.message : "Failed to update password.");
    } finally { setIsChanging(false); }
  }, [currentPw, newPw, allPassing]);

  const handleSignOutAll = () => {
    if (window.confirm("Sign out of all devices? You'll need to log in again.")) {
      logout();
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-xl font-semibold text-ink">Security</h1>
        <p className="text-sub text-sm mt-1">Manage your password and account access.</p>
      </div>

      {/* Change password */}
      <Section title="Change password">
        {pwSuccess && (
          <div className="rounded-[4px] bg-green-50 border border-success/30 px-4 py-3 text-sm text-success">
            Password updated successfully.
          </div>
        )}
        {pwError && (
          <div className="rounded-[4px] bg-red-50 border border-danger/20 px-4 py-3 text-sm text-danger">
            {pwError}
          </div>
        )}
        <div className="space-y-4">
          <PasswordInput
            label="Current password"
            value={currentPw}
            onChange={setCurrentPw}
            placeholder="Enter your current password"
          />
          <PasswordInput
            label="New password"
            value={newPw}
            onChange={setNewPw}
            placeholder="Create a strong password"
          />
          {newPw && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {REQUIREMENTS.map((req) => {
                const pass = req.test(newPw);
                return (
                  <div key={req.label} className={`flex items-center gap-1.5 text-[12px] ${pass ? "text-success" : "text-muted"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${pass ? "bg-success" : "bg-border"}`} />
                    {req.label}
                  </div>
                );
              })}
            </div>
          )}
          <PasswordInput
            label="Confirm new password"
            value={confirmPw}
            onChange={setConfirmPw}
            placeholder="Repeat your new password"
          />
          {confirmPw && newPw !== confirmPw && (
            <p className="text-[12px] text-danger">Passwords do not match.</p>
          )}
        </div>
        <Button
          className="w-full"
          onClick={handleChangePassword}
          isLoading={isChanging}
          loadingText="Updating…"
          disabled={!allPassing}
        >
          <Lock className="w-4 h-4" /> Update Password
        </Button>
      </Section>

      {/* 2FA */}
      <Section title="Two-factor authentication" description="Add an extra layer of security to your account.">
        <div className="flex items-center justify-between gap-4 py-1">
          <div className="flex items-center gap-3">
            <Smartphone className="w-5 h-5 text-muted shrink-0" />
            <div>
              <p className="text-sm font-medium text-ink">Authenticator app</p>
              <p className="text-[13px] text-sub">Use an app like Google Authenticator or Authy.</p>
            </div>
          </div>
          <span className="text-[11px] font-semibold text-muted bg-[var(--bg)] border border-border px-2 py-0.5 rounded-[4px] uppercase tracking-wider shrink-0">
            Coming soon
          </span>
        </div>
      </Section>

      {/* Active sessions */}
      <Section title="Active sessions" description="Devices currently signed into your account.">
        <div className="divide-y divide-border">
          <div className="flex items-center gap-4 py-3 first:pt-0">
            <Monitor className="w-5 h-5 text-muted shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink">Current device</p>
              <p className="text-[13px] text-sub truncate">
                {typeof window !== "undefined" ? window.navigator.userAgent.split(" ").slice(-1)[0] : "Browser"} · Active now
              </p>
            </div>
            <span className="text-[11px] font-semibold text-success bg-green-50 border border-success/30 px-2 py-0.5 rounded-[4px] shrink-0">
              This device
            </span>
          </div>
        </div>
        <div className="pt-2">
          <button
            onClick={handleSignOutAll}
            className="flex items-center gap-1.5 text-[13px] text-danger hover:text-danger/80 transition-colors font-medium"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign out of all devices
          </button>
        </div>
      </Section>
    </div>
  );
}
