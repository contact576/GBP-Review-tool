"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ds/Button";
import { Input } from "@/components/ds/form";
import { useToast } from "@/components/ds/Toast";
import { inviteStaffAction, addStaffMemberAction } from "@/lib/actions";

/** Invite by email (persisted, duplicate-guarded) + add a staff member directly. */
export function InviteStaff() {
  const { toast } = useToast();
  const router = useRouter();
  const [inviting, startInvite] = useTransition();
  const [adding, startAdd] = useTransition();

  const [email, setEmail] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);

  function invite() {
    const value = email.trim().toLowerCase();
    if (!value) {
      setInviteError("Enter an email to invite.");
      return;
    }
    startInvite(async () => {
      const result = await inviteStaffAction(value);
      if (!result.ok) {
        setInviteError(result.error ?? "Couldn't save that invite.");
        return;
      }
      setEmail("");
      setInviteError(null);
      toast(`Invite saved for ${value}`, "success", "send");
      router.refresh();
    });
  }

  function addDirect() {
    const value = name.trim();
    if (!value) {
      setNameError("Enter a name to add.");
      return;
    }
    startAdd(async () => {
      await addStaffMemberAction(value);
      setName("");
      setNameError(null);
      toast(`${value} added — personal QR ready`, "success", "qr");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {/* Invite by email */}
      <div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex-1">
            <Input
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (inviteError) setInviteError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") invite();
              }}
              placeholder="teammate@business.com"
              iconLeft="mail"
              invalid={Boolean(inviteError)}
              aria-label="Teammate email"
            />
          </div>
          <Button icon="plus" onClick={invite} loading={inviting} className="shrink-0">
            Invite staff
          </Button>
        </div>
        {inviteError ? (
          <p className="mt-1.5 flex items-center gap-1 text-[12px] text-danger" role="alert">
            <span className="inline-block size-1.5 rounded-full bg-danger" />
            {inviteError}
          </p>
        ) : (
          <p className="mt-1.5 text-[12px] text-faint">
            Saved as a pending invite — the invite email goes out once the email service is
            connected. Duplicates are blocked.
          </p>
        )}
      </div>

      {/* Add directly */}
      <div className="border-t border-hairline pt-4">
        <div className="mb-1.5 text-[14px] font-semibold text-ink">Add a staff member directly</div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex-1">
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") addDirect();
              }}
              placeholder="Staff member's name"
              iconLeft="users"
              invalid={Boolean(nameError)}
              aria-label="Staff member's name"
            />
          </div>
          <Button variant="secondary" icon="qr" onClick={addDirect} loading={adding} className="shrink-0">
            Add member
          </Button>
        </div>
        {nameError ? (
          <p className="mt-1.5 flex items-center gap-1 text-[12px] text-danger" role="alert">
            <span className="inline-block size-1.5 rounded-full bg-danger" />
            {nameError}
          </p>
        ) : (
          <p className="mt-1.5 text-[12px] text-faint">
            Creates a working staff row with their own QR code and capture link — no email needed.
          </p>
        )}
      </div>
    </div>
  );
}
