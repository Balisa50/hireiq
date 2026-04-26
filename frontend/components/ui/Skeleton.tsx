import React from "react";
import { clsx } from "clsx";

interface SkeletonProps {
  className?: string;
  /** Inline height — use a Tailwind class instead when possible */
  height?: number | string;
}

/**
 * Shimmer skeleton placeholder.
 * Uses the .skeleton CSS class defined in globals.css.
 */
export default function Skeleton({ className, height }: SkeletonProps) {
  return (
    <div
      className={clsx("skeleton", className)}
      style={height !== undefined ? { height } : undefined}
    />
  );
}

/** A skeleton row that mimics a table/list item */
export function SkeletonRow({ cols = 1 }: { cols?: number }) {
  return (
    <div className="flex items-center gap-4 px-5 py-4 border-b border-border last:border-b-0">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} className={i === 0 ? "h-4 flex-1" : "h-4 w-20 shrink-0"} />
      ))}
    </div>
  );
}

/** A skeleton card */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={clsx("bg-white border border-border rounded-[4px] p-5 space-y-3", className)}>
      <Skeleton className="h-4 w-2/5" />
      <Skeleton className="h-3 w-3/5" />
      <Skeleton className="h-3 w-1/3" />
    </div>
  );
}
