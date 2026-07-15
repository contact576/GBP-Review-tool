"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Field, Input } from "@/components/ds";
import { Icon } from "@/components/icons";
import { initials } from "@/lib/utils/format";
import { inviteStaffAction } from "@/lib/actions";
import type { StaffInvite, StaffMember } from "@/lib/data/types";

export function TeamInvitePanel({
  invites,
  staff,
}: {
  invites: StaffInvite[];
  staff: StaffMember[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add() {
    const value = email.trim().toLowerCase();
    if (!value) return;
    start(async () => {
      const result = await inviteStaffAction(value);
      if (!result.ok) {
        setError(result.error ?? "Couldn't save that invite.");
        return;
      }
      setEmail("");
      setError(null);
      router.refresh();
    });
  }

  const hasRows = invites.length > 0 || staff.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <Field label="Teammate email" className="flex-1">
          <Input
            type="email"
            inputMode="email"
            placeholder="name@business.com"
            value={email}
            invalid={!!error}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
        </Field>
        <Button variant="secondary" size="md" icon="plus" onClick={add} loading={pending}>
          Add
        </Button>
      </div>
      {error ? (
        <p className="-mt-2 flex items-center gap-1.5 text-[12px] text-danger" role="alert">
          <Icon name="alert" size={13} className="shrink-0" /> {error}
        </p>
      ) : null}

      {hasRows ? (
        <Card padded={false} className="divide-y divide-hairline overflow-hidden">
          {staff.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-chip bg-hero text-[12px] font-bold text-white">
                {s.avatarInitials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold text-ink">{s.displayName}</div>
                <div className="truncate text-[12px] capitalize text-sub">{s.role}</div>
              </div>
              <Badge tone="primary" icon="check">On the team</Badge>
            </div>
          ))}
          {invites.map((inv) => (
            <div key={inv.id} className="flex items-center gap-3 px-4 py-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-chip bg-hero text-[12px] font-bold text-white">
                {initials(inv.email.split("@")[0]?.replace(/[._]/g, " ") ?? inv.email)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold text-ink">{inv.email}</div>
                <div className="truncate text-[12px] capitalize text-sub">{inv.role}</div>
              </div>
              <Badge tone="gold" icon="clock">Invited</Badge>
            </div>
          ))}
        </Card>
      ) : (
        <Card>
          <p className="py-4 text-center text-[13px] text-faint">
            No team members yet — add a teammate&apos;s email above.
          </p>
        </Card>
      )}

      <p className="text-[12px] text-faint">
        Invites are saved to your workspace now; invite emails go out once the email service is
        connected. Duplicates are blocked automatically.
      </p>
    </div>
  );
}
