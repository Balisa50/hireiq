"use client";


export function TopBar({ company, title, progress }: { company: string; title: string; progress: number }) {
  return (
    <div className="border-b border-border bg-[var(--bg)] shrink-0">
      <div className="max-w-[680px] mx-auto px-4 h-12 flex items-center justify-between gap-4">
        <span className="text-[12px] text-muted truncate">{company}</span>
        <span className="text-[12px] text-muted truncate hidden sm:block">{title}</span>
        <div className="w-24 h-1 bg-border rounded-full overflow-hidden shrink-0">
          <div className="h-full bg-ink rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
}
