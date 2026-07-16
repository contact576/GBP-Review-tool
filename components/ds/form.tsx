"use client";

import { cloneElement, forwardRef, isValidElement, useId, type ReactElement } from "react";
import { cn } from "@/lib/utils/cn";
import { Icon, type IconName } from "@/components/icons";

// ── Field wrapper ───────────────────────────────────────────
export function Field({
  label, hint, error, required, children, className,
}: {
  label?: string; hint?: string; error?: string; required?: boolean;
  children: React.ReactNode; className?: string;
}) {
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  // Programmatically link the control to its error/hint text and mark it
  // invalid, without altering the visual output.
  let control = children;
  if (isValidElement(children) && describedBy) {
    const child = children as ReactElement<{
      "aria-describedby"?: string;
      "aria-invalid"?: boolean | "true" | "false";
    }>;
    const existing = child.props["aria-describedby"];
    control = cloneElement(child, {
      "aria-describedby": [existing, describedBy].filter(Boolean).join(" ") || undefined,
      "aria-invalid": error ? (child.props["aria-invalid"] ?? true) : child.props["aria-invalid"],
    });
  }

  return (
    <label className={cn("block", className)}>
      {label ? (
        <span className="block text-[14px] font-semibold text-ink mb-1.5">
          {label}
          {required ? <span className="text-danger"> *</span> : null}
        </span>
      ) : null}
      {control}
      {error ? (
        <span id={errorId} className="mt-1 block text-[12px] text-danger" role="alert">{error}</span>
      ) : hint ? (
        <span id={hintId} className="mt-1 block text-[12px] text-faint">{hint}</span>
      ) : null}
    </label>
  );
}

const inputBase =
  "w-full rounded-input border bg-card px-3.5 text-[15px] text-ink placeholder:text-faint transition-colors focus-visible:outline-none focus-visible:border-primary min-h-[44px] h-11";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; iconLeft?: IconName }>(
  function Input({ className, invalid, iconLeft, ...props }, ref) {
    if (iconLeft) {
      return (
        <div className="relative">
          <Icon name={iconLeft} size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" aria-hidden />
          <input ref={ref} aria-invalid={invalid || undefined} className={cn(inputBase, "pl-10", invalid ? "border-danger" : "border-hairline", className)} {...props} />
        </div>
      );
    }
    return <input ref={ref} aria-invalid={invalid || undefined} className={cn(inputBase, invalid ? "border-danger" : "border-hairline", className)} {...props} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ className, invalid, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          "w-full rounded-input border bg-card px-3.5 py-3 text-[15px] text-ink placeholder:text-faint transition-colors focus-visible:outline-none focus-visible:border-primary min-h-[96px] resize-y",
          invalid ? "border-danger" : "border-hairline",
          className,
        )}
        {...props}
      />
    );
  },
);

export function Select({
  className, children, ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={cn(inputBase, "appearance-none pr-10 border-hairline", className)}
        {...props}
      >
        {children}
      </select>
      <Icon name="chevron-down" size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
    </div>
  );
}

// ── Toggle switch ───────────────────────────────────────────
export function Toggle({
  checked, onChange, label, disabled,
}: {
  checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-chip transition-colors",
        checked ? "bg-primary" : "bg-hairline",
        disabled && "opacity-50 pointer-events-none",
      )}
    >
      <span className={cn("inline-block size-5 rounded-full bg-white shadow-sm transition-transform", checked ? "translate-x-[22px]" : "translate-x-0.5")} />
    </button>
  );
}

// ── Checkbox (with explicit label for consent) ──────────────
export function Checkbox({
  checked, onChange, label, hint, id,
}: {
  checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode; hint?: string; id?: string;
}) {
  const genId = useId();
  const inputId = id ?? genId;
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        id={inputId}
        onClick={() => onChange(!checked)}
        className={cn(
          "mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition-colors",
          checked ? "bg-primary border-primary text-white" : "bg-card border-hairline",
        )}
      >
        {checked ? <Icon name="check" size={14} /> : null}
      </button>
      <label htmlFor={inputId} className="text-[14px] text-ink leading-snug cursor-pointer">
        {label}
        {hint ? <span className="block text-[12px] text-faint mt-0.5">{hint}</span> : null}
      </label>
    </div>
  );
}
