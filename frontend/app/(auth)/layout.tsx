import React from "react";
import Link from "next/link";

function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <polyline points="9 11 12 14 15 8" />
    </svg>
  );
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      <header className="px-6 py-4 border-b border-border bg-white">
        <Link href="/" className="flex items-center gap-2 w-fit text-ink hover:text-ink-2 transition-colors">
          <BrandMark className="w-5 h-5" />
          <span className="font-semibold text-sm tracking-tight">HireIQ</span>
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        {children}
      </main>

      <footer className="text-center text-[13px] text-muted py-6 border-t border-border">
        © {new Date().getFullYear()} HireIQ.{" "}
        <Link href="/privacy" className="hover:text-sub transition-colors">Privacy</Link>
        {" · "}
        <Link href="/terms" className="hover:text-sub transition-colors">Terms</Link>
      </footer>
    </div>
  );
}
