"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function GoogleCallbackPage() {
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    async function finalise() {
      try {
        // Supabase automatically exchanges the hash fragment for a session
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error || !session?.access_token) {
          throw new Error(error?.message ?? "No session returned from Google.");
        }

        const token = session.access_token;

        // Tell the backend to get/create the company profile for this Google user
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

        // Store the Supabase JWT — the backend validates it directly
        localStorage.setItem("hireiq_token", token);
        window.location.href = "/dashboard";
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
        setStatus("error");
      }
    }

    finalise();
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
