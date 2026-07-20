"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { resetPasswordAction, type PasswordResetResult } from "@/lib/actions";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ds/Button";
import { Card } from "@/components/ds/Card";
import { Field, Input } from "@/components/ds/form";

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [result, setResult] = useState<PasswordResetResult | null>(null);
  const [pending, startTransition] = useTransition();

  if (!token) {
    return (
      <Card raised className="p-6 text-center sm:p-8">
        <span className="mx-auto grid size-12 place-items-center rounded-card bg-danger-tint text-danger"><Icon name="lock" size={22} /></span>
        <h1 className="mt-4 text-[20px] font-extrabold text-ink">Reset link required</h1>
        <p className="mt-2 text-[14px] text-sub">This password-reset link is incomplete or invalid.</p>
        <Link href="/forgot-password" className="mt-5 inline-block text-[13px] font-semibold text-primary">Request a new link</Link>
      </Card>
    );
  }

  if (result?.ok) {
    return (
      <Card raised className="p-6 text-center sm:p-8">
        <span className="mx-auto grid size-12 place-items-center rounded-card bg-primary-wash text-primary"><Icon name="check-circle" size={24} /></span>
        <h1 className="mt-4 text-[20px] font-extrabold text-ink">Password reset</h1>
        <p className="mt-2 text-[14px] text-sub" role="status">{result.message}</p>
        <Link href="/sign-in" className="mt-5 inline-block text-[13px] font-semibold text-primary">Sign in with your new password</Link>
      </Card>
    );
  }

  return (
    <Card raised className="p-6 sm:p-8">
      <div className="text-center">
        <h1 className="text-[24px] font-extrabold tracking-tight text-ink">Choose a new password</h1>
        <p className="mt-1 text-[14px] text-sub">Use at least eight characters with a letter and a number.</p>
      </div>
      <form
        className="mt-6 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (password !== confirm) {
            setResult({ ok: false, message: "Passwords do not match." });
            return;
          }
          setResult(null);
          startTransition(async () => setResult(await resetPasswordAction({ token, password })));
        }}
      >
        <Field label="New password">
          <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" iconLeft="lock" minLength={8} maxLength={128} required />
        </Field>
        <Field label="Confirm new password">
          <Input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" iconLeft="lock" minLength={8} maxLength={128} required />
        </Field>
        {result && !result.ok ? <div role="alert" className="rounded-btn border border-danger/20 bg-danger-tint px-3 py-2 text-[13px] text-danger">{result.message}</div> : null}
        <Button type="submit" size="lg" fullWidth loading={pending}>Reset password</Button>
      </form>
    </Card>
  );
}
