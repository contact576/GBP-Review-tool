"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ds/Button";
import { Card } from "@/components/ds/Card";
import { Field, Input } from "@/components/ds/form";
import { Divider, Kicker } from "@/components/ds/misc";
import { signInAction } from "@/lib/actions";
import type { SessionRole } from "@/lib/auth/session";

const DEMOS: { role: SessionRole; dest: string; label: string; sub: string; icon: "home" | "building" | "shield" }[] = [
  { role: "owner", dest: "/app", label: "Enter as Owner", sub: "The full business dashboard", icon: "home" },
  { role: "agency_admin", dest: "/agency", label: "Enter as Agency", sub: "White-label multi-client console", icon: "building" },
  { role: "platform_admin", dest: "/admin", label: "Enter as Admin", sub: "Platform operations & health", icon: "shield" },
];

export function SignInForm({ next }: { next?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeRole, setActiveRole] = useState<SessionRole | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function enter(role: SessionRole, dest: string) {
    setActiveRole(role);
    startTransition(async () => {
      await signInAction(role);
      router.push(role === "owner" && next ? next : dest);
      router.refresh();
    });
  }

  return (
    <Card raised>
      <div className="text-center">
        <h1 className="text-[24px] font-extrabold tracking-tight text-ink">Welcome back</h1>
        <p className="mt-1 text-[14px] text-sub">Sign in to keep the growth loop spinning.</p>
      </div>

      {/* Demo entry — the fast path */}
      <div className="mt-6 rounded-card border border-primary/25 bg-primary-wash p-4">
        <div className="flex items-center gap-2">
          <Icon name="sparkles" size={16} className="text-primary" />
          <Kicker>Enter demo — one click</Kicker>
        </div>
        <div className="mt-3 space-y-2">
          {DEMOS.map((d) => (
            <button
              key={d.role}
              type="button"
              onClick={() => enter(d.role, d.dest)}
              disabled={pending}
              className="flex w-full items-center gap-3 rounded-btn border border-hairline bg-card px-3 py-3 text-left transition-colors hover:border-primary/40 disabled:opacity-60 min-h-[56px]"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-btn bg-primary-tint text-primary-dark">
                <Icon name={d.icon} size={18} />
              </span>
              <span className="flex-1">
                <span className="block text-[14px] font-bold text-ink">{d.label}</span>
                <span className="block text-[12px] text-sub">{d.sub}</span>
              </span>
              {pending && activeRole === d.role ? (
                <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              ) : (
                <Icon name="chevron-right" size={18} className="shrink-0 text-faint" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="my-6 flex items-center gap-3">
        <Divider className="flex-1" />
        <span className="text-[12px] text-faint">or sign in normally</span>
        <Divider className="flex-1" />
      </div>

      {/* Mock Google */}
      <Button
        type="button"
        variant="secondary"
        fullWidth
        icon="google"
        onClick={() => enter("owner", "/app")}
        disabled={pending}
      >
        Continue with Google
      </Button>

      {/* Email / password — mock */}
      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          enter("owner", "/app");
        }}
      >
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com" iconLeft="mail" autoComplete="email" />
        </Field>
        <Field label="Password">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" iconLeft="lock" autoComplete="current-password" />
        </Field>
        <div className="flex justify-end">
          <Link href="/two-factor" className="text-[13px] font-medium text-primary hover:text-primary-dark">
            Use two-factor code
          </Link>
        </div>
        <Button type="submit" fullWidth loading={pending && activeRole === "owner"}>Sign in</Button>
      </form>

      <p className="mt-5 text-center text-[13px] text-sub">
        New to Foundly?{" "}
        <Link href="/sign-up" className="font-semibold text-primary hover:text-primary-dark">Start free</Link>
      </p>
    </Card>
  );
}
