"use client";

import { useState } from "react";
import { Button } from "@/components/ds/Button";
import { useToast } from "@/components/ds/Toast";

/** Mock reconnect / manage action for an integration. */
export function ReconnectButton({ label, connected }: { label: string; connected: boolean }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  function onClick() {
    setBusy(true);
    toast(
      connected ? `Opening ${label} settings` : `Reconnecting ${label}…`,
      "info",
      connected ? "settings" : "refresh",
    );
    setTimeout(() => setBusy(false), 900);
  }

  return (
    <Button variant={connected ? "ghost" : "secondary"} size="sm" icon={connected ? "settings" : "refresh"} onClick={onClick} loading={busy}>
      {connected ? "Manage" : "Reconnect"}
    </Button>
  );
}
