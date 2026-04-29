"use client";

/**
 * Wraps children with AuthProvider only on routes that need auth.
 * Public candidate-facing routes (/apply/, /interview/) are excluded so
 * AuthProvider's loadCompanyProfile never fires, eliminating the isLoading
 * flash and any accidental /login redirect on those pages.
 */

import React from "react";
import { usePathname } from "next/navigation";
import { AuthProvider } from "@/lib/auth-context";

const PUBLIC_PREFIXES = ["/apply/", "/interview/"];

export default function ConditionalAuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isPublic = PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (isPublic) return <>{children}</>;
  return <AuthProvider>{children}</AuthProvider>;
}
