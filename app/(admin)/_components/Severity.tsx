import { Badge } from "@/components/ds/misc";
import type { IconName } from "@/components/icons";

export type Sev = "low" | "medium" | "high";

const MAP: Record<Sev, { tone: "sub" | "gold" | "danger"; icon: IconName; label: string }> = {
  low: { tone: "sub", icon: "eye", label: "Low" },
  medium: { tone: "gold", icon: "flag", label: "Medium" },
  high: { tone: "danger", icon: "alert", label: "High" },
};

export function SeverityBadge({ sev }: { sev: Sev }) {
  const s = MAP[sev];
  return <Badge tone={s.tone} icon={s.icon}>{s.label}</Badge>;
}

export const sevRank: Record<Sev, number> = { high: 0, medium: 1, low: 2 };
