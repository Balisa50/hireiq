"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { authAPI } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

export default function LoginPage() {
  const { refreshProfile } = useAuth();

  const [email, setEmail]               = useState("");
  const [password, setPassword]         = useState("");
  const [error, setError]               = useState("");
  const [isLoading, setIsLoading]       = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [slowHint, setSlowHint]         = useState(false);
  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Show "waking up" hint if login takes more than 8 seconds
  useEffect(() => {
    if (isLoading) {
      slowTimer.current = setTimeout(() => setSlowHint(true), 8_000);
    } else {
      if (slowTimer.current) clearTimeout(slowTimer.current);
      setSlowHint(false);
    }
    return () => {
      if (slowTimer.current) clearTimeout(slowTimer.current);
    };
  }, [isLoading]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email.trim() || !password) return;
      setIsLoading(true);
      setError("");
      try {
        await authAPI.login(email.trim().toLowerCase(), password);
        await refreshProfile();
        window.location.href = "/dashboard";
      } catch (err) {
        setError(err instanceof Error ? err.message : "Invalid email or password.");
      } finally {
        setIsLoading(false);
      }
    },
    [email, password, refreshProfile],
  );

  const handleGoogleLogin = useCallback(async () => {
    setIsGoogleLoading(true);
    setError("");
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/google/callback`,
        },
      });
      if (oauthError) throw oauthError;
      // Page will redirect — keep loading state
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed. Please try again.");
      setIsGoogleLoading(false);
    }
  }, []);

  return (
    <div className="w-full max-w-sm animate-slide-up">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-ink">Welcome back</h1>
        <p className="text-sub text-sm mt-1">Sign in to your HireIQ account</p>
      </div>

      <div className="bg-white border border-border rounded-[4px] p-6">
        {error && (
          <div className="flex items-start gap-2 rounded-[4px] bg-red-50 border border-danger/20 px-4 py-3 text-sm text-danger mb-5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {slowHint && (
          <div className="rounded-[4px] bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700 mb-5">
            Server is waking up. This can take up to 30 seconds on first sign-in. Hang tight.
          </div>
        )}

        {/* Google OAuth */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={isGoogleLoading || isLoading}
          className="w-full flex items-center justify-center gap-2.5 bg-white border border-border rounded-[4px] px-4 py-2.5 text-sm font-medium text-ink hover:bg-canvas transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <GoogleIcon />
          {isGoogleLoading ? "Redirecting…" : "Continue with Google"}
        </button>

        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-white px-3 text-[13px] text-muted">or</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Work email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            autoComplete="email"
            required
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />

          <Button
            type="submit"
            className="w-full mt-2"
            size="lg"
            isLoading={isLoading}
            loadingText="Signing in…"
          >
            Sign in
          </Button>
        </form>
      </div>

      <p className="text-center text-sm text-sub mt-6">
        No account?{" "}
        <Link
          href="/signup"
          className="text-ink font-medium underline underline-offset-2 hover:text-ink-2 transition-colors"
        >
          Create one free
        </Link>
      </p>
    </div>
  );
}
