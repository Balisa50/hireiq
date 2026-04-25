"use client";

import React, { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { authAPI } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

export default function LoginPage() {
  const router = useRouter();
  const { refreshProfile } = useAuth();

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email.trim() || !password) return;

      setIsLoading(true);
      setError("");

      try {
        await authAPI.login(email.trim().toLowerCase(), password);
        await refreshProfile();
        router.replace("/dashboard");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Invalid email or password.");
      } finally {
        setIsLoading(false);
      }
    },
    [email, password, refreshProfile, router],
  );

  return (
    <div className="w-full max-w-sm animate-slide-up">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-white">Welcome back</h1>
        <p className="text-[var(--text-muted)] text-sm mt-1">Sign in to your HireIQ account</p>
      </div>

      <div className="glass rounded-2xl p-6">
        {error && (
          <div className="flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400 mb-5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Work Email"
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
            loadingText="Signing in..."
          >
            Sign In
          </Button>
        </form>
      </div>

      <p className="text-center text-sm text-[var(--text-muted)] mt-6">
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className="text-brand-400 font-semibold hover:text-brand-300 transition-colors"
        >
          Create one free
        </Link>
      </p>
    </div>
  );
}
