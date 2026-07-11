"use client";

import { useState } from "react";
import { Button } from "@/components/ds/Button";
import { Input } from "@/components/ds/form";
import { useToast } from "@/components/ds/Toast";

/** Invite input with a duplicate-guard demo. */
export function InviteStaff({ existingNames }: { existingNames: string[] }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const lowered = existingNames.map((n) => n.toLowerCase().trim());

  function invite() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a name to invite.");
      return;
    }
    if (lowered.includes(trimmed.toLowerCase())) {
      setError("Already on your team");
      return;
    }
    setError(null);
    toast(`Invite sent to ${trimmed}`, "success", "send");
    setName("");
  }

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex-1">
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") invite();
            }}
            placeholder="Staff member's name"
            iconLeft="users"
            invalid={Boolean(error)}
            aria-label="Staff member's name"
          />
        </div>
        <Button icon="plus" onClick={invite} className="shrink-0">
          Invite staff
        </Button>
      </div>
      {error ? (
        <p className="mt-1.5 flex items-center gap-1 text-[12px] text-danger" role="alert">
          <span className="inline-block size-1.5 rounded-full bg-danger" />
          {error}
        </p>
      ) : (
        <p className="mt-1.5 text-[12px] text-faint">They&apos;ll get a personal QR code and capture link.</p>
      )}
    </div>
  );
}
