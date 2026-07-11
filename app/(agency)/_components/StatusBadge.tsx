import { Badge } from "@/components/ds/misc";
import type { IconName } from "@/components/icons";
import type { AgencyClient } from "@/lib/data/types";

type Status = AgencyClient["status"];

const MAP: Record<Status, { tone: "primary" | "gold" | "danger"; icon: IconName; label: string }> = {
  healthy: { tone: "primary", icon: "check-circle", label: "Healthy" },
  attention: { tone: "gold", icon: "alert", label: "Attention" },
  at_risk: { tone: "danger", icon: "flag", label: "At risk" },
};

export function StatusBadge({ status }: { status: Status }) {
  const s = MAP[status];
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {s.label}
    </Badge>
  );
}

export const statusRank: Record<Status, number> = { at_risk: 0, attention: 1, healthy: 2 };
