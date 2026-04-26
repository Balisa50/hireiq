"use client";

import React, { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { authAPI } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

const SPECIAL = new Set("!@#$%^&*()_+-=[]{}|;':\",./<>?");

const PASSWORD_REQUIREMENTS = [
  { label: "At least 12 characters",       test: (p: string) => p.length >= 12 },
  { label: "One uppercase letter",          test: (p: string) => /[A-Z]/.test(p) },
  { label: "One lowercase letter",          test: (p: string) => /[a-z]/.test(p) },
  { label: "One number",                   test: (p: string) => /\d/.test(p) },
  { label: "One special character",         test: (p: string) => p.split("").some((c) => SPECIAL.has(c)) },
];

export default function SignupPage() {
  const router = useRouter();
  const { refreshProfile } = useAuth();

  const [companyName, setCompanyName] = useState("");
  const [email, setEmail]             = useState("");
  const [password, setPassword]       = useState("");
  const [error, setError]             = useState("");
  const [isLoading, setIsLoading]     = useState(false);

  const passwordMeta  = PASSWORD_REQUIREMENTS.map((req) => ({ ...req, passed: req.test(password) }));
  const passwordValid = passwordMeta.every((r) => r.passed);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!companyName.trim() || !email.trim() || !password) return;
      if (!passwordValid) { setError("Password does not meet requirements."); return; }
      setIsLoading(true);
      setError("");
      try {
        await authAPI.signUp(email.trim().toLowerCase(), password, companyName.trim());
        await refreshProfile();
        router.replace("/dashboard");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create account. Please try again.");
      } finally {
        setIsLoading(false);
      }
    },
    [companyName, email, password, passwordValid, refreshProfile, router],
  );

  return (
    <div className="w-full max-w-sm animate-slide-up">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-ink">Start hiring smarter</h1>
        <p className="text-sub text-sm mt-1">Set up in minutes. Cancel any time.</p>
      </div>

      <div className="bg-white border border-border rounded-[4px] p-6">
        {error && (
          <div className="flex items-start gap-2 rounded-[4px] bg-red-50 border border-danger/20 px-4 py-3 text-sm text-danger mb-5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Company name"
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Acme Corp"
            autoComplete="organization"
            required
          />
          <Input
            label="Work email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            autoComplete="email"
            required
          />
          <div className="space-y-2">
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create a strong password"
              autoComplete="new-password"
              required
            />
            {password.length > 0 && (
              <div className="space-y-1 pt-1">
                {passwordMeta.map((req) => (
                  <div key={req.label} className="flex items-center gap-2 text-[13px]">
                    <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${req.passed ? "text-success" : "text-muted"}`} />
                    <span className={req.passed ? "text-success" : "text-muted"}>{req.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Button
            type="submit"
            className="w-full mt-2"
            size="lg"
            isLoading={isLoading}
            loadingText="Creating account..."
            disabled={!passwordValid && password.length > 0}
          >
            Create free account
          </Button>
        </form>

        <p className="text-center text-[13px] text-muted mt-4">
          By signing up you agree to our{" "}
          <Link href="/terms" className="underline hover:text-sub">Terms</Link>
          {" "}and{" "}
          <Link href="/privacy" className="underline hover:text-sub">Privacy Policy</Link>.
        </p>
      </div>

      <p className="text-center text-sm text-sub mt-6">
        Already have an account?{" "}
        <Link href="/login" className="text-ink font-medium underline underline-offset-2 hover:text-ink-2 transition-colors">
          Sign in
        </Link>
      </p>
    </div>
  );
}
