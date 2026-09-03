"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";
import type { JobPublicInfo } from "@/lib/types";
import { GoogleIcon, Mark, Spinner } from "./icons";

export interface AuthScreenProps {
  jobInfo: JobPublicInfo;
  onAuth: (name: string, email: string) => Promise<void>;
  onGoogleAuth: () => Promise<void>;
  isLoading: boolean;
  googleLoading: boolean;
  globalError: string;
}

export function AuthScreen({ jobInfo, onAuth, onGoogleAuth, isLoading, googleLoading, globalError }: AuthScreenProps) {
  const [name, setName]       = useState("");
  const [email, setEmail]     = useState("");
  const [consent, setConsent] = useState(false);
  const [errors, setErrors]   = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!name.trim() || name.trim().length < 2) e.name = "Please enter your full name.";
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Please enter a valid email address.";
    if (!consent) e.consent = "Please confirm your consent to proceed.";
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    await onAuth(name.trim(), email.trim().toLowerCase());
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-4 py-12" dir="ltr">
      <div className="max-w-[400px] w-full space-y-6">
        <div className="text-center space-y-3">
          <Mark className="w-7 h-7 text-ink mx-auto" />
          <p className="text-[13px] text-muted">
            Applying to{" "}
            <span className="font-semibold text-ink">{jobInfo.company_name}</span>
            {" · "}
            <span className="text-sub">{jobInfo.title}</span>
          </p>
          <h1 className="text-[26px] font-bold text-ink leading-tight"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
            Create an account to apply
          </h1>
          <p className="text-[13px] text-sub leading-relaxed">
            Your account lets you save progress and return to your application if needed.
          </p>
        </div>

        <div className="bg-white border border-border rounded-[4px] p-6 space-y-4">
          {globalError && (
            <div className="flex items-start gap-2 rounded-[4px] bg-red-50 border border-danger/20 px-3 py-2.5 text-[13px] text-danger">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {globalError}
            </div>
          )}

          <button
            onClick={onGoogleAuth}
            disabled={googleLoading || isLoading}
            className="w-full flex items-center justify-center gap-3 bg-[#1A1714] text-white rounded-[4px] px-4 py-3 text-[14px] font-medium hover:bg-[#2d2926] transition-colors disabled:opacity-50"
          >
            {googleLoading ? <Spinner /> : <GoogleIcon />}
            Continue with Google
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[12px] text-muted">or enter your details</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-[12px] font-medium text-ink mb-1">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                autoComplete="name"
                dir="ltr"
                className={`w-full bg-[var(--bg)] border rounded-[4px] px-3 py-2.5 text-[14px] text-ink outline-none transition-colors focus:border-ink placeholder:text-muted ${errors.name ? "border-danger" : "border-border"}`}
              />
              {errors.name && <p className="text-[12px] text-danger mt-1">{errors.name}</p>}
            </div>
            <div>
              <label className="block text-[12px] font-medium text-ink mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                autoComplete="email"
                dir="ltr"
                onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                className={`w-full bg-[var(--bg)] border rounded-[4px] px-3 py-2.5 text-[14px] text-ink outline-none transition-colors focus:border-ink placeholder:text-muted ${errors.email ? "border-danger" : "border-border"}`}
              />
              {errors.email && <p className="text-[12px] text-danger mt-1">{errors.email}</p>}
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-ink cursor-pointer shrink-0"
              />
              <span className="text-[12px] text-sub leading-relaxed">
                I confirm my answers are my own and consent to them being reviewed by{" "}
                <strong>{jobInfo.company_name}</strong>&apos;s hiring team.
              </span>
            </label>
            {errors.consent && <p className="text-[12px] text-danger">{errors.consent}</p>}
          </div>

          <button
            onClick={handleSubmit}
            disabled={isLoading || googleLoading}
            className="w-full bg-[#1A1714] text-white rounded-[4px] px-4 py-3 text-[14px] font-semibold hover:bg-[#2d2926] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? <><Spinner /> Setting up your application…</> : "Continue →"}
          </button>
        </div>
      </div>
    </div>
  );
}
