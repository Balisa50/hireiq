"use client";

import React from "react";
import { clsx } from "clsx";
import { AlertCircle } from "lucide-react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export default function Input({ label, error, hint, className, id, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-[13px] font-medium text-ink">
          {label}
          {props.required && <span className="text-danger ml-0.5" aria-hidden>*</span>}
        </label>
      )}
      <input
        id={inputId}
        className={clsx(
          "w-full bg-white border rounded-[4px] px-3 py-2 text-sm text-ink",
          "placeholder:text-muted outline-none transition-colors",
          "focus:border-ink",
          error
            ? "border-danger focus:border-danger"
            : "border-border",
          className,
        )}
        {...props}
      />
      {error && (
        <p className="flex items-center gap-1.5 text-[13px] text-danger">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </p>
      )}
      {hint && !error && (
        <p className="text-[13px] text-sub">{hint}</p>
      )}
    </div>
  );
}
