"use client";

import React, { useState } from "react";
import { clsx } from "clsx";
import { AlertCircle, Eye, EyeOff } from "lucide-react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export default function Input({ label, error, hint, className, id, type, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
  const isPassword = type === "password";
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-[13px] font-medium text-ink">
          {label}
          {props.required && <span className="text-danger ml-0.5" aria-hidden>*</span>}
        </label>
      )}
      <div className="relative">
        <input
          id={inputId}
          type={isPassword ? (showPassword ? "text" : "password") : type}
          className={clsx(
            "w-full bg-white border rounded-[4px] px-3 py-2.5 text-base text-ink",
            "placeholder:text-muted outline-none transition-colors",
            "focus:border-ink",
            isPassword && "pr-9",
            error
              ? "border-danger focus:border-danger"
              : "border-border",
            className,
          )}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition-colors"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword
              ? <EyeOff className="w-4 h-4" />
              : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
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
