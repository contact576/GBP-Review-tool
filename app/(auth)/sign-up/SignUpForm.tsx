"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ds/Button";
import { Card } from "@/components/ds/Card";
import { Field, Input, Checkbox } from "@/components/ds/form";
import { Divider } from "@/components/ds/misc";
import { signInAction } from "@/lib/actions";

const TRIAL_POINTS = [
  "Full Growth plan, free for 14 days",
  "No credit card required to start",
  "Keep a free plan forever when it ends",
];

export function SignUpForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreeTips, setAgreeTips] = useState(false);
  const [showError, setShowError] = useState(false);

  function createAccount() {
    if (!agreeTerms) {
      setShowError(true);
      return;
    }
    startTransition(async () => {
      await signInAction("owner");
      router.push("/onboarding/find-business");
      router.refresh();
    });
  }

  return (
    <Card raised>
      <div className="text-center">
        <h1 className="text-[24px] font-extrabold leading-tight tracking-tight text-ink">
          Start your 14-day Growth trial
        </h1>
        <p className="mt-1 text-[14px] text-sub">No card. No catch. Cancel anytime.</p>
      </div>

      {/* Trial-terms card */}
      <div className="mt-5 rounded-card border border-primary/25 bg-primary-wash p-4">
        <ul className="space-y-2">
          {TRIAL_POINTS.map((p) => (
            <li key={p} className="flex items-start gap-2 text-[13px] font-medium text-ink">
              <Icon name="check-circle" size={16} className="mt-0.5 shrink-0 text-primary" />
              {p}
            </li>
          ))}
        </ul>
      </div>

      {/* Mock Google */}
      <Button
        type="button"
        variant="secondary"
        fullWidth
        icon="google"
        className="mt-5"
        onClick={createAccount}
        disabled={pending}
      >
        Sign up with Google
      </Button>

      <div className="my-5 flex items-center gap-3">
        <Divider className="flex-1" />
        <span className="text-[12px] text-faint">or with email</span>
        <Divider className="flex-1" />
      </div>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          createAccount();
        }}
      >
        <Field label="Your name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Chen" iconLeft="users" autoComplete="name" />
        </Field>
        <Field label="Work email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com" iconLeft="mail" autoComplete="email" />
        </Field>
        <Field label="Password">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Create a password" iconLeft="lock" autoComplete="new-password" />
        </Field>

        {/* Consent — two separate, granular checkboxes */}
        <div className="space-y-3 rounded-card border border-hairline bg-paper p-4">
          <Checkbox
            checked={agreeTerms}
            onChange={(v) => {
              setAgreeTerms(v);
              if (v) setShowError(false);
            }}
            label={
              <>
                I agree to the{" "}
                <Link href="/legal/terms" className="font-semibold text-primary underline">Terms</Link> and{" "}
                <Link href="/legal/privacy" className="font-semibold text-primary underline">Privacy Policy</Link>.
              </>
            }
          />
          <Checkbox
            checked={agreeTips}
            onChange={setAgreeTips}
            label="Send me occasional product tips and updates (optional)."
          />
        </div>
        {showError ? (
          <p className="text-[12px] text-danger" role="alert">
            Please accept the Terms and Privacy Policy to continue.
          </p>
        ) : null}

        <Button type="submit" fullWidth loading={pending}>Create account</Button>
      </form>

      <p className="mt-5 text-center text-[13px] text-sub">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-semibold text-primary hover:text-primary-dark">Sign in</Link>
      </p>
    </Card>
  );
}
