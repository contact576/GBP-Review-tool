"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ds/Button";
import { Card } from "@/components/ds/Card";
import { Field, Input } from "@/components/ds/form";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <Card raised>
        <div className="flex flex-col items-center px-2 py-4 text-center">
          <span className="grid size-12 place-items-center rounded-card bg-primary-wash text-primary">
            <Icon name="check-circle" size={24} />
          </span>
          <h1 className="mt-4 text-[20px] font-extrabold tracking-tight text-ink">
            Check your inbox
          </h1>
          <p className="mt-2 max-w-sm text-[14px] text-sub" role="status">
            If that account exists, a reset link is on its way to{" "}
            <span className="font-semibold text-ink">{email}</span>.
          </p>
          <p className="mt-3 max-w-sm text-[12px] text-faint">
            Heads up: reset emails start sending once the platform email service is configured —
            this environment doesn&rsquo;t deliver email yet.
          </p>
          <Link
            href="/sign-in"
            className="mt-5 text-[13px] font-semibold text-primary hover:text-primary-dark"
          >
            Back to sign in
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card raised>
      <div className="text-center">
        <h1 className="text-[24px] font-extrabold tracking-tight text-ink">
          Reset your password
        </h1>
        <p className="mt-1 text-[14px] text-sub">
          Enter your email and we&rsquo;ll send you a link to set a new one.
        </p>
      </div>

      <form
        className="mt-5 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(true);
        }}
      >
        <Field label="Email">
          <Input
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@business.com"
            iconLeft="mail"
            autoComplete="email"
            required
          />
        </Field>
        <Button type="submit" fullWidth>
          Send reset link
        </Button>
      </form>

      <p className="mt-5 text-center text-[13px] text-sub">
        Remembered it?{" "}
        <Link href="/sign-in" className="font-semibold text-primary hover:text-primary-dark">
          Back to sign in
        </Link>
      </p>
    </Card>
  );
}
