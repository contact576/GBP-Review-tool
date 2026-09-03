"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ds/Card";
import { Button } from "@/components/ds/Button";
import { Badge } from "@/components/ds/misc";
import { Field, Input, Select } from "@/components/ds/form";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/ds/Toast";
import { PLANS, PLAN_ORDER, type PlanId } from "@/lib/billing/plans";
import { formatDate, formatRelative } from "@/lib/utils/format";
import {
  deleteTenantAction,
  extendTenantTrialAction,
  forceTenantSignOutAction,
  openTenantWorkspaceAction,
  setTenantSubscriptionAction,
  setTenantUserEmailVerifiedAction,
} from "@/lib/actions";
import type { PlatformTenantUser, Subscription } from "@/lib/data/types";

const STATUS_OPTIONS: { value: Subscription["status"]; label: string }[] = [
  { value: "trialing", label: "Trialing" },
  { value: "active", label: "Active (paying)" },
  { value: "past_due", label: "Past due" },
  { value: "paused", label: "Paused" },
  { value: "canceled", label: "Canceled" },
  { value: "free", label: "Free" },
];

export function OpenTenantButton({
  workspaceId, tenantName, enabled,
}: {
  workspaceId?: string;
  tenantName: string;
  enabled: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!workspaceId) return null;
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        size="sm"
        icon="external"
        loading={pending}
        disabled={!enabled}
        aria-label={`Open ${tenantName} as Foundly support`}
        onClick={() =>
          start(async () => {
            const result = await openTenantWorkspaceAction(workspaceId);
            if (result && !result.ok) setError(result.error);
          })
        }
      >
        Open tenant
      </Button>
      {error ? <span role="status" className="text-[11px] text-danger">{error}</span> : null}
    </span>
  );
}

interface WorkspaceSub {
  workspaceId: string;
  name: string;
  tier: PlanId;
  status: Subscription["status"];
  interval: "monthly" | "annual";
  trialEndsAt?: string;
  stripeSubscriptionId?: string;
}

/**
 * Plan, status, interval and trial — set by hand. This bypasses Stripe on
 * purpose (comps, migrations, a card that failed for a good customer), so the
 * panel says so and every change lands in the tenant's ledger.
 */
export function TenantSubscriptionPanel({ workspaces, enabled }: { workspaces: WorkspaceSub[]; enabled: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [selected, setSelected] = useState(workspaces[0]?.workspaceId ?? "");
  const current = workspaces.find((ws) => ws.workspaceId === selected) ?? workspaces[0];
  const [tier, setTier] = useState<PlanId>(current?.tier ?? "free");
  const [status, setStatus] = useState<Subscription["status"]>(current?.status ?? "free");
  const [interval, setInterval] = useState<"monthly" | "annual">(current?.interval ?? "monthly");
  const [days, setDays] = useState("14");
  const [saving, startSave] = useTransition();
  const [extending, startExtend] = useTransition();

  function pick(workspaceId: string) {
    setSelected(workspaceId);
    const next = workspaces.find((ws) => ws.workspaceId === workspaceId);
    if (next) {
      setTier(next.tier);
      setStatus(next.status);
      setInterval(next.interval);
    }
  }

  const dirty = current ? tier !== current.tier || status !== current.status || interval !== current.interval : false;

  function save() {
    if (!current) return;
    startSave(async () => {
      const result = await setTenantSubscriptionAction(current.workspaceId, {
        ...(tier !== current.tier ? { tier } : {}),
        ...(status !== current.status ? { status } : {}),
        ...(interval !== current.interval ? { interval } : {}),
      });
      if (!result.ok) {
        toast(result.error, "danger", "alert");
        return;
      }
      toast(`${current.name} updated — written to their audit log`, "success", "check-circle");
      router.refresh();
    });
  }

  function extend() {
    if (!current) return;
    startExtend(async () => {
      const result = await extendTenantTrialAction(current.workspaceId, Number(days));
      if (!result.ok) {
        toast(result.error, "danger", "alert");
        return;
      }
      toast(`Trial extended by ${days} days`, "success", "clock");
      router.refresh();
    });
  }

  if (!current) return null;

  return (
    <Card>
      <CardHeader kicker="Billing" title="Subscription" />
      <div className="space-y-3">
        {workspaces.length > 1 ? (
          <Field label="Location">
            <Select value={selected} onChange={(event) => pick(event.target.value)}>
              {workspaces.map((ws) => (
                <option key={ws.workspaceId} value={ws.workspaceId}>{ws.name}</option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label="Plan">
          <Select value={tier} onChange={(event) => setTier(event.target.value as PlanId)} disabled={!enabled}>
            {PLAN_ORDER.map((id) => (
              <option key={id} value={id}>{PLANS[id].name} · ${PLANS[id].priceMonthly}/mo</option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status">
            <Select value={status} onChange={(event) => setStatus(event.target.value as Subscription["status"])} disabled={!enabled}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Interval">
            <Select value={interval} onChange={(event) => setInterval(event.target.value as "monthly" | "annual")} disabled={!enabled}>
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
            </Select>
          </Field>
        </div>
        <Button icon="check" fullWidth loading={saving} disabled={!enabled || !dirty} onClick={save}>
          Apply to {current.name}
        </Button>
        {current.stripeSubscriptionId ? (
          <p className="flex items-start gap-1.5 rounded-btn bg-gold-tint p-2.5 text-[12px] text-gold-deep">
            <Icon name="alert" size={14} className="mt-px shrink-0" />
            This workspace has a Stripe subscription. Changing it here does not change Stripe — the next webhook can
            overwrite a manual status. Use it for comps and corrections only.
          </p>
        ) : (
          <p className="text-[12px] text-faint">
            No Stripe subscription — this is the only place this workspace&rsquo;s plan is set. MRR on the roster
            follows active / past-due at the plan price.
          </p>
        )}

        <div className="h-px bg-hairline" />

        <div className="space-y-2">
          <div className="text-[13px] text-sub">
            Trial {current.trialEndsAt ? `ends ${formatDate(current.trialEndsAt)}` : "has no end date"}.
          </div>
          <div className="flex items-end gap-2">
            <div className="w-28">
              <Field label="Extend by (days)">
                <Input type="number" min={1} max={365} inputMode="numeric" value={days} onChange={(event) => setDays(event.target.value)} disabled={!enabled} />
              </Field>
            </div>
            <Button variant="secondary" icon="clock" loading={extending} disabled={!enabled} onClick={extend}>
              Extend trial
            </Button>
          </div>
          <p className="text-[12px] text-faint">Sets status to trialing and pushes the end date out from today or its current end, whichever is later.</p>
        </div>
      </div>
    </Card>
  );
}

function UserRow({ user, enabled }: { user: PlatformTenantUser; enabled: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [which, setWhich] = useState<"signout" | "verify" | null>(null);

  function run(kind: "signout" | "verify") {
    setWhich(kind);
    start(async () => {
      const result =
        kind === "signout"
          ? await forceTenantSignOutAction(user.workspaceId, user.id)
          : await setTenantUserEmailVerifiedAction(user.workspaceId, user.id, !user.emailVerified);
      setWhich(null);
      if (!result.ok) {
        toast(result.error, "danger", "alert");
        return;
      }
      toast(kind === "signout" ? `Every session for ${user.email} revoked` : `Email ${user.emailVerified ? "unverified" : "verified"}`, "success", "check-circle");
      router.refresh();
    });
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-[14px] font-semibold text-ink">{user.email}</span>
          <Badge tone="neutral">{user.role.replace("_", " ")}</Badge>
          {user.hasLogin ? <Badge tone="primary" icon="check-circle">Login</Badge> : <Badge tone="sub" icon="lock">No login</Badge>}
          {user.emailVerified ? <Badge tone="primary" icon="mail">Verified</Badge> : <Badge tone="gold" icon="alert">Unverified</Badge>}
        </div>
        <div className="truncate text-[12px] text-sub">
          {user.name}{user.createdAt ? ` · since ${formatRelative(user.createdAt)}` : ""} · <code className="text-[11px]">{user.workspaceId}</code>
        </div>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <Button size="sm" variant="ghost" icon="mail" loading={pending && which === "verify"} disabled={!enabled || pending} onClick={() => run("verify")}>
          {user.emailVerified ? "Unverify" : "Mark verified"}
        </Button>
        <Button size="sm" variant="secondary" icon="lock" loading={pending && which === "signout"} disabled={!enabled || pending || !user.hasLogin} onClick={() => run("signout")}>
          Sign out everywhere
        </Button>
      </div>
    </li>
  );
}

export function TenantUsersPanel({ users, enabled }: { users: PlatformTenantUser[]; enabled: boolean }) {
  return (
    <Card>
      <CardHeader kicker="Access" title="Users" />
      {users.length ? (
        <ul className="divide-y divide-hairline">
          {users.map((user) => (
            <UserRow key={user.id} user={user} enabled={enabled} />
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-faint">No user rows on this tenant.</p>
      )}
      <p className="mt-3 flex items-start gap-1.5 text-[12px] text-faint">
        <Icon name="shield" size={13} className="mt-px shrink-0" />
        Sign out everywhere bumps the user&rsquo;s session version, invalidating every issued token. Verified gates
        sending review requests, not signing in.
      </p>
    </Card>
  );
}

export function TenantDangerZone({
  organizationId, tenantName, workspaces, users, enabled,
}: {
  organizationId: string;
  tenantName: string;
  workspaces: number;
  users: number;
  enabled: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, start] = useTransition();
  const matches = typed.trim().toLowerCase() === tenantName.trim().toLowerCase();

  function remove() {
    start(async () => {
      const result = await deleteTenantAction(organizationId, typed);
      if (!result.ok) {
        toast(result.error, "danger", "alert");
        return;
      }
      toast(`${tenantName} deleted`, "info", "flag");
      router.push("/admin/tenants");
      router.refresh();
    });
  }

  return (
    <Card className="border-danger/30">
      <CardHeader kicker="Danger zone" title="Delete tenant" />
      {!open ? (
        <div className="space-y-3 text-[13px] text-sub">
          <p>
            Deletes {workspaces} workspace{workspaces === 1 ? "" : "s"}, {users} user{users === 1 ? "" : "s"}, and every
            customer, request, review, credential and ledger entry they hold. Stripe is not touched. This cannot be undone.
          </p>
          <Button variant="danger" icon="x" fullWidth disabled={!enabled} onClick={() => setOpen(true)}>
            Delete this tenant
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label={`Type ${tenantName} to confirm`}>
            <Input value={typed} onChange={(event) => setTyped(event.target.value)} autoFocus maxLength={160} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" icon="x" loading={pending} disabled={!matches} onClick={remove}>
              Delete everything
            </Button>
            <Button variant="ghost" onClick={() => { setOpen(false); setTyped(""); }}>Cancel</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
