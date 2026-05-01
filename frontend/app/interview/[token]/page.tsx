"use client";

/**
 * Legacy route, redirects to the new /apply/[token] URL.
 * Keeps old shared links working.
 */

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function LegacyInterviewRedirect() {
  const { token } = useParams<{ token: string }>();
  const router    = useRouter();

  useEffect(() => {
    router.replace(`/apply/${token}`);
  }, [token, router]);

  return null;
}
