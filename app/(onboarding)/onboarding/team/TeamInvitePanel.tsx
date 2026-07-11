"use client";

import { useState } from "react";
import { Badge, Button, Card, Field, Input } from "@/components/ds";
import { Icon } from "@/components/icons";
import { initials } from "@/lib/utils/format";

interface Member {
  name: string;
  email: string;
  status: "invited" | "pending";
}

const SEED: Member[] = [
  { name: "Priya Nair", email: "priya@harbourview.ca", status: "invited" },
  { name: "Dan Okafor", email: "dan@harbourview.ca", status: "invited" },
  { name: "Jonah Reyes", email: "jonah@harbourview.ca", status: "invited" },
];

export function TeamInvitePanel() {
  const [members, setMembers] = useState<Member[]>(SEED);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add() {
    const value = email.trim().toLowerCase();
    if (!value) return;
    if (members.some((m) => m.email.toLowerCase() === value)) {
      setError(`${value} is already on your team.`);
      return;
    }
    const handle = value.split("@")[0]?.replace(/[._]/g, " ") ?? value;
    setMembers((prev) => [...prev, { name: handle, email: value, status: "pending" }]);
    setEmail("");
    setError(null);
  }

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
        <Button variant="secondary" size="md" icon="plus" onClick={add}>
          Add
        </Button>
      </div>
      {error ? (
        <p className="-mt-2 flex items-center gap-1.5 text-[12px] text-danger" role="alert">
          <Icon name="alert" size={13} className="shrink-0" /> {error}
        </p>
      ) : null}

      <Card padded={false} className="divide-y divide-hairline overflow-hidden">
        {members.map((m) => (
          <div key={m.email} className="flex items-center gap-3 px-4 py-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-chip bg-hero text-[12px] font-bold text-white">
              {initials(m.name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-semibold capitalize text-ink">{m.name}</div>
              <div className="truncate text-[12px] text-sub">{m.email}</div>
            </div>
            <Badge
              tone={m.status === "invited" ? "primary" : "gold"}
              icon={m.status === "invited" ? "check" : "clock"}
            >
              {m.status === "invited" ? "Invited" : "Sending"}
            </Badge>
          </div>
        ))}
      </Card>

      <p className="text-[12px] text-faint">
        Try adding a teammate who&apos;s already listed — Foundly blocks duplicate invites.
      </p>
    </div>
  );
}
