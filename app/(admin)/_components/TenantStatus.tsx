import { Badge } from "@/components/ds/misc";
import type { IconName } from "@/components/icons";
import type { PlatformTenant } from "@/lib/data/types";

type Status = PlatformTenant["status"];

const MAP: Record<Status, { tone: "primary" | "gold" | "danger" | "sub"; icon: IconName; label: string }> = {
  active: { tone: "primary", icon: "check-circle", label: "Active" },
  trialing: { tone: "gold", icon: "clock", label: "Trial" },
  past_due: { tone: "danger", icon: "alert", label: "Past due" },
  free: { tone: "sub", icon: "eye", label: "Free" },
};

export function TenantStatusBadge({ status }: { status: Status }) {
  const s = MAP[status];
  return <Badge tone={s.tone} icon={s.icon}>{s.label}</Badge>;
}
