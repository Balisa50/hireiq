"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import Sidebar from "@/components/layout/Sidebar";
import { pingBackendHealth, authAPI } from "@/lib/api";
import Skeleton from "@/components/ui/Skeleton";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Only redirect to /login if loading is done AND there is genuinely no
    // stored token. A failed API call (network error, cold-start) must not
    // bounce the user to login — that is handled by auth-context retries.
    if (!isLoading && !isAuthenticated && !authAPI.isAuthenticated()) {
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  // Keep Render warm — ping every 4 minutes
  useEffect(() => {
    const id = setInterval(pingBackendHealth, 240_000);
    return () => clearInterval(id);
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-screen bg-[var(--bg)]">
        {/* Sidebar skeleton */}
        <div className="hidden md:flex flex-col w-[240px] shrink-0 bg-white border-r border-border min-h-screen p-4 space-y-3">
          <Skeleton className="h-6 w-24 mb-4" />
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-8 w-full rounded-[4px]" />)}
        </div>
        <main className="flex-1 flex items-center justify-center">
          <Skeleton className="h-4 w-24" />
        </main>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="flex min-h-screen bg-[var(--bg)]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar — clears the fixed hamburger so page titles are never clipped */}
        <div className="md:hidden sticky top-0 z-30 h-14 bg-white border-b border-border shrink-0" />
        <main className="flex-1 px-6 sm:px-8 lg:px-10 py-8 md:py-10 max-w-5xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
