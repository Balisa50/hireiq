import React from "react";
import { clsx } from "clsx";

interface ScoreBadgeProps {
  score: number | null;
  size?: "sm" | "md" | "lg";
}

export default function ScoreBadge({ score, size = "md" }: ScoreBadgeProps) {
  if (score === null || score === undefined) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/5 text-[var(--text-dim)] border border-[var(--border)]">
        Pending
      </span>
    );
  }

  const colorClasses =
    score >= 80
      ? "bg-green-500/10 text-green-400 border-green-500/20"
      : score >= 60
      ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
      : "bg-red-500/10 text-red-400 border-red-500/20";

  const sizeClasses = {
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-2.5 py-1 font-semibold",
    lg: "text-lg px-4 py-1.5 font-bold",
  };

  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border",
        colorClasses,
        sizeClasses[size],
      )}
    >
      {score}/100
    </span>
  );
}
