"use client";

import React from "react";
import { clsx } from "clsx";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export default function Input({
  label,
  error,
  hint,
  className,
  id,
  ...props
}: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="space-y-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-[var(--text-muted)]"
        >
          {label}
          {props.required && (
            <span className="text-red-400 ml-1" aria-hidden="true">*</span>
          )}
        </label>
      )}
      <input
        id={inputId}
        className={clsx(
          "w-full bg-[var(--bg-elevated)] border rounded-xl px-4 py-2.5 text-[var(--text)] text-sm",
          "placeholder:text-[var(--text-dim)] outline-none transition-colors",
          "focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30",
          error
            ? "border-red-500/50 focus:border-red-500 focus:ring-red-500/30"
            : "border-[var(--border)]",
          className,
        )}
        {...props}
      />
      {error && (
        <p className="text-xs text-red-400 flex items-center gap-1.5">
          <span>⚠</span> {error}
        </p>
      )}
      {hint && !error && (
        <p className="text-xs text-[var(--text-dim)]">{hint}</p>
      )}
    </div>
  );
}
