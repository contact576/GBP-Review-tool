"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ds/Button";
import { Card } from "@/components/ds/Card";
import { Field, Input } from "@/components/ds/form";
import { Divider, Kicker } from "@/components/ds/misc";
import { loginAction, enterDemoAction } from "@/lib/actions";
import type { SessionRole } from "@/lib/auth/session";

const DEMOS: { role: SessionRole; dest: string; label: string }[] = [
  { role: "owner", dest: "/app", label: "Demo: Owner" },
  { role: "agency_admin", dest: "/agency", label: "Demo: Agency" },
  { role: "platform_admin", dest: "/admin", label: "Demo: Admin" },
];

// Matches Button variant="secondary" size="md" fullWidth — used for the
// Google entry, which must be a plain <a> to the OAuth route, not a <button>.
const googleLinkClass =
  "inline-flex h-[52px] min-h-[52px] w-full select-none items-center justify-center gap-2 whitespace-nowrap rounded-btn border border-hairline bg-card px-4 text-[14px] font-semibold text-ink transition-all duration-150 hover:bg-primary-wash hover:border-primary/30";

// Fintech-grade field sizing for auth (~54px), applied via className so the
// shared Input/Select tokens stay untouched.
const authFieldSize = "h-[54px] min-h-[54px]";

export function SignInForm({
  next,
  googleEnabled,
}: {
  next?: string;
  googleEnabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [demoPending, startDemoTransition] = useTransition();
  const [demoRole, setDemoRole] = useState<SessionRole | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const busy = pending || demoPending;

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    // Read the DOM, not React state.
    //
    // These inputs are controlled off state that starts empty, so anything the
    // visitor types before hydration finishes is discarded the moment React
    // takes over — on a throttled phone this silently submitted blank or
    // half-captured credentials and came back "Invalid email or password" for a
    // correct password, burning a rate-limit slot each time. The form element
    // holds what the visitor actually typed; state is only the fallback.
    const data = new FormData(e.currentTarget);
    const typedEmail = String(data.get("email") ?? "").trim() || email;
    const typedPassword = String(data.get("password") ?? "") || password;
    startTransition(async () => {
      const result = await loginAction({ email: typedEmail, password: typedPassword });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong. Please try again.");
        return;
      }
      router.push(next && next.startsWith("/") ? next : "/app");
      router.refresh();
    });
  }

  function enterDemo(role: SessionRole, dest: string) {
    setDemoRole(role);
    startDemoTransition(async () => {
      await enterDemoAction(role);
      router.push(dest);
      router.refresh();
    });
  }

  return (
    <Card raised className="p-6 sm:p-8">
      <div className="text-center">
        <h1 className="text-[24px] font-extrabold tracking-tight text-ink">Welcome back</h1>
        <p className="mt-1 text-[14px] text-sub">Sign in to keep the growth loop spinning.</p>
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-5 flex items-start gap-2 rounded-btn border border-danger/30 bg-danger-tint px-3 py-2.5 text-[13px] font-medium text-danger"
        >
          <Icon name="alert" size={15} className="mt-0.5 shrink-0" />
          {error}
        </div>
      ) : null}

      {/* method="post" so a pre-hydration submit cannot fall back to a GET that
          places the password in the URL (history, logs, Referer). */}
      <form className="mt-6 space-y-4" method="post" onSubmit={submit}>
        <Field label="Email">
          <Input
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@business.com"
            iconLeft="mail"
            autoComplete="email"
            className={authFieldSize}
            required
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            iconLeft="lock"
            autoComplete="current-password"
            className={authFieldSize}
            required
          />
        </Field>
        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-[13px] font-medium text-primary hover:text-primary-dark"
          >
            Forgot password?
          </Link>
        </div>
        <Button type="submit" size="lg" fullWidth loading={pending} disabled={busy}>
          Sign in
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3">
        <Divider className="flex-1" />
        <span className="text-[12px] text-faint">or</span>
        <Divider className="flex-1" />
      </div>

      {googleEnabled ? (
        <a href="/api/auth/google" className={googleLinkClass}>
          <Icon name="google" size={18} />
          Continue with Google
        </a>
      ) : (
        <div>
          <span aria-disabled="true" className={`${googleLinkClass} pointer-events-none opacity-50`}>
            <Icon name="google" size={18} />
            Continue with Google
          </span>
          <p className="mt-1.5 text-center text-[12px] text-faint">
            Google sign-in not configured yet
          </p>
        </div>
      )}

      <Divider className="my-5" />

      {/* Demo — explicit, clearly labeled, separate from real accounts */}
      <div className="rounded-card border border-hairline bg-paper p-4">
        <div className="flex items-center gap-2">
          <Icon name="eye" size={15} className="text-sub" />
          <Kicker>Explore the demo</Kicker>
        </div>
        <p className="mt-1.5 text-[13px] text-sub">
          Browse a fully-populated sample business — clearly labeled, separate from real accounts.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {DEMOS.map((d) => (
            <Button
              key={d.role}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => enterDemo(d.role, d.dest)}
              loading={demoPending && demoRole === d.role}
              disabled={busy}
            >
              {d.label}
            </Button>
          ))}
        </div>
      </div>

      <p className="mt-5 text-center text-[13px] text-sub">
        New here?{" "}
        <Link href="/sign-up" className="font-semibold text-primary hover:text-primary-dark">
          Start your free trial
        </Link>
      </p>
    </Card>
  );
}
