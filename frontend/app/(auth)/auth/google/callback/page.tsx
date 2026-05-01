"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function GoogleCallbackPage() {
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [loadingMsg, setLoadingMsg] = useState("Signing you in…");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    // Guard so the first of (getSession / onAuthStateChange) to fire wins.
    let handled = false;

    async function completeSignIn(token: string) {
      if (handled) return;
      handled = true;

      // Retry up to 4 times, Render free tier cold-starts can take ~50s.
      // We wait progressively longer between attempts so a warm server
      // responds on attempt 1 and a cold server gets enough time.
      const delays = [0, 3000, 8000, 15000];
      const msgs   = ["Signing you in…", "Almost there…", "Waking up the server…", "Just a moment more…"];
      setLoadingMsg(msgs[0]);
      let lastErr: string = "Failed to sign in. Please try again.";

      for (let attempt = 0; attempt < delays.length; attempt++) {
        if (delays[attempt] > 0) {
          setLoadingMsg(msgs[attempt] ?? msgs[msgs.length - 1]);
          await new Promise((r) => setTimeout(r, delays[attempt]));
        }
        try {
          const res = await fetch(`${API_BASE}/api/auth/google`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            signal: AbortSignal.timeout(55_000),
          });

          if (!res.ok) {
            const body = await res.json().catch(() => ({})) as { detail?: string };
            lastErr = body.detail ?? lastErr;
            // 4xx errors are definitive, no point retrying
            if (res.status >= 400 && res.status < 500) break;
            continue;
          }

          // Success, persist token and redirect
          localStorage.setItem("hireiq_token", token);
          window.location.href = "/dashboard";
          return;
        } catch {
          // Network error / timeout, try again
        }
      }

      setErrorMsg(lastErr);
      setStatus("error");
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
    // render), getSession() returns it immediately, no need to wait for the
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
      <p className="text-sm text-sub">{loadingMsg}</p>
    </div>
  );
}
