import React from "react";

interface ScoreBadgeProps {
  score: number | null;
  size?: "sm" | "md" | "lg";
}

export default function ScoreBadge({ score, size = "md" }: ScoreBadgeProps) {
  if (score === null || score === undefined) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] text-muted">
        <span className="w-1.5 h-1.5 rounded-full bg-border inline-block" />
        Pending
      </span>
    );
  }

  const isHigh = score >= 80;
  const isMid  = score >= 60;

  const dotClass  = isHigh ? "bg-success" : isMid ? "bg-warn" : "bg-danger";
  const textClass = isHigh ? "text-success" : isMid ? "text-warn" : "text-danger";

  const textSize = size === "lg" ? "text-base font-semibold" : size === "sm" ? "text-[13px]" : "text-sm";

  return (
    <span className={`inline-flex items-center gap-1.5 ${textSize} ${textClass}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} />
      {score}/100
    </span>
  );
}
