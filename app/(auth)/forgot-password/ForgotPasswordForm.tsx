"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { requestPasswordResetAction, type PasswordResetResult } from "@/lib/actions";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ds/Button";
import { Card } from "@/components/ds/Card";
import { Field, Input } from "@/components/ds/form";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<PasswordResetResult | null>(null);
  const [pending, startTransition] = useTransition();

  if (result?.ok) {
    return (
      <Card raised className="p-6 sm:p-8">
        <div className="flex flex-col items-center px-2 py-4 text-center">
          <span className="grid size-12 place-items-center rounded-card bg-primary-wash text-primary">
            <Icon name="mail" size={24} />
          </span>
          <h1 className="mt-4 text-[20px] font-extrabold tracking-tight text-ink">Check your email</h1>
          <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-sub" role="status">
            {result.message}
          </p>
          <p className="mt-3 max-w-sm text-[12px] leading-relaxed text-faint">
            For privacy, this message is the same whether or not the address belongs to a Foundly account.
          </p>
          <Link href="/sign-in" className="mt-5 text-[13px] font-semibold text-primary hover:text-primary-dark">
            Back to sign in
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card raised className="p-6 sm:p-8">
      <div className="text-center">
        <h1 className="text-[24px] font-extrabold tracking-tight text-ink">Reset your password</h1>
        <p className="mt-1 text-[14px] text-sub">Enter your email and we&rsquo;ll send a one-hour reset link.</p>
      </div>

      <form
        className="mt-6 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          setResult(null);
          // The DOM holds what was typed; state is empty until hydration. See
          // the note in SignInForm — same controlled-input trap, same fix.
          const typed = String(new FormData(event.currentTarget).get("email") ?? "").trim() || email;
          startTransition(async () => setResult(await requestPasswordResetAction(typed)));
        }}
      >
        <Field label="Email">
          <Input
            type="email"
            name="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@business.com"
            iconLeft="mail"
            autoComplete="email"
            className="h-[54px] min-h-[54px]"
            maxLength={320}
            required
          />
        </Field>
        {result && !result.ok ? (
          <div role="alert" className="rounded-btn border border-danger/20 bg-danger-tint px-3 py-2 text-[13px] text-danger">
            {result.message}
          </div>
        ) : null}
        <Button type="submit" size="lg" fullWidth loading={pending}>Send reset link</Button>
      </form>

      <p className="mt-5 text-center text-[13px] text-sub">
        Remembered it?{" "}
        <Link href="/sign-in" className="font-semibold text-primary hover:text-primary-dark">Back to sign in</Link>
      </p>
    </Card>
  );
}
