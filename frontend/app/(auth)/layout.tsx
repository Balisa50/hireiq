import React from "react";
import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Minimal nav */}
      <header className="px-6 py-4 border-b border-[var(--border)]">
        <Link href="/" className="flex items-center gap-2 w-fit">
          <div className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center">
            <span className="text-white text-xs font-black">H</span>
          </div>
          <span className="text-[var(--text)] font-bold text-sm tracking-tight">HireIQ</span>
        </Link>
      </header>

      {/* Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        {children}
      </main>

      <footer className="text-center text-xs text-[var(--text-dim)] py-6">
        © {new Date().getFullYear()} HireIQ.{" "}
        <Link href="/privacy" className="hover:text-[var(--text-muted)] transition-colors">Privacy</Link>
        {" · "}
        <Link href="/terms" className="hover:text-[var(--text-muted)] transition-colors">Terms</Link>
      </footer>
    </div>
  );
}
