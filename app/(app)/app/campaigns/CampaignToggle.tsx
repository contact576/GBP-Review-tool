"use client";

import { useState } from "react";
import { Toggle } from "@/components/ds/form";
import { useToast } from "@/components/ds/Toast";

export function CampaignToggle({
  name,
  initialActive,
}: {
  name: string;
  initialActive: boolean;
}) {
  const { toast } = useToast();
  const [active, setActive] = useState(initialActive);

  return (
    <Toggle
      checked={active}
      label={`Turn ${name} ${active ? "off" : "on"}`}
      onChange={(v) => {
        setActive(v);
        toast(v ? `${name} is live` : `${name} paused`, v ? "success" : "info", v ? "check-circle" : "clock");
      }}
    />
  );
}
