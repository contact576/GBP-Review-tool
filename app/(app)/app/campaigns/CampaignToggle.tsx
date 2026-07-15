"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Toggle } from "@/components/ds/form";
import { useToast } from "@/components/ds/Toast";
import { setCampaignStatusAction } from "@/lib/actions";

export function CampaignToggle({
  id,
  name,
  initialActive,
}: {
  id: string;
  name: string;
  initialActive: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [, start] = useTransition();
  const [active, setActive] = useState(initialActive);

  function onChange(v: boolean) {
    setActive(v);
    start(async () => {
      await setCampaignStatusAction(id, v ? "active" : "paused");
      toast(v ? `${name} is active` : `${name} paused`, v ? "success" : "info", v ? "check-circle" : "clock");
      router.refresh();
    });
  }

  return <Toggle checked={active} label={`Turn ${name} ${active ? "off" : "on"}`} onChange={onChange} />;
}
