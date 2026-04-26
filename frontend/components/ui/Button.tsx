"use client";

import React from "react";
import { clsx } from "clsx";
import { Loader2 } from "lucide-react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  loadingText?: string;
}

export default function Button({
  variant = "primary",
  size = "md",
  isLoading = false,
  loadingText,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed";

  const variants = {
    primary:
      "bg-ink text-white hover:bg-ink-2 rounded-[4px]",
    secondary:
      "bg-white text-ink border border-border hover:border-sub rounded-[4px]",
    ghost:
      "text-sub hover:text-ink hover:bg-canvas rounded-[4px]",
    danger:
      "bg-white text-danger border border-danger hover:bg-red-50 rounded-[4px]",
    outline:
      "bg-white text-ink border border-border hover:border-ink rounded-[4px]",
  };

  const sizes = {
    sm:  "text-[13px] px-3 py-1.5 h-8",
    md:  "text-sm px-4 py-2 h-9",
    lg:  "text-sm px-5 py-2.5 h-10",
  };

  return (
    <button
      className={clsx(base, variants[variant], sizes[size], className)}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <>
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>{loadingText ?? children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
