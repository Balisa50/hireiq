"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function GoogleCallbackPage() {
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    // Guard so the first of (getSession / onAuthStateChange) to fire wins.
    let handled = false;

    async function completeSignIn(token: string) {
      if (handled) return;
      handled = true;

      try {
        // Register / fetch the company profile on the backend
        const res = await fetch(`${API_BASE}/api/auth/google`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { detail?: string };
          throw new Error(body.detail ?? "Failed to sign in. Please try again.");
        }

        // Persist the Supabase JWT — auth-context + backend both use this
        localStorage.setItem("hireiq_token", token);
        window.location.href = "/dashboard";
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
        setStatus("error");
      }
    }

    // ── Path A: PKCE code exchange ──────────────────────────────────────────
    // Supabase v2 defaults to PKCE. The provider redirects back with ?code=xxx.
    // Supabase exchanges the code in the background; onAuthStateChange fires a
    // SIGNED_IN event once it completes.  This is the primary path.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_IN" && session?.access_token) {
          completeSignIn(session.access_token);
        }
      },
    );

    // ── Path B: Implicit / already-exchanged session ────────────────────────
    // If the session is already in storage (e.g. implicit flow or a second
    // render), getSession() returns it immediately — no need to wait for the
    // auth-change event.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        completeSignIn(session.access_token);
      }
    });

    // ── Timeout fallback ────────────────────────────────────────────────────
    const timeout = setTimeout(() => {
      if (!handled) {
        setErrorMsg("Sign-in timed out. Please try again.");
        setStatus("error");
      }
    }, 15_000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  if (status === "error") {
    return (
      <div className="w-full max-w-sm text-center space-y-4">
        <p className="text-sm text-danger">{errorMsg}</p>
        <a
          href="/login"
          className="text-sm text-ink underline underline-offset-2 hover:text-ink-2 transition-colors"
        >
          Back to sign in
        </a>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm text-center">
      <p className="text-sm text-sub">Signing you in…</p>
    </div>
  );
}
