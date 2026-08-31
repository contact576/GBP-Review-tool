import { Badge } from "@/components/ds/misc";
import type { IconName } from "@/components/icons";
import { NotMeasuredBadge } from "./telemetry";

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

/**
 * Health chip for a countable signal, honest across all three states:
 *   not measured → neutral "Not measured" (never green)
 *   measured, 0  → green "Clear" (earned — we looked, there is nothing)
 *   measured, n  → the worst severity in the set
 */
export function SignalBadge({
  measured,
  count,
  sev,
}: {
  measured: boolean;
  count: number;
  sev: Sev;
}) {
  if (!measured) return <NotMeasuredBadge />;
  if (count === 0) {
    return <Badge tone="primary" icon="check-circle">Clear</Badge>;
  }
  return <SeverityBadge sev={sev} />;
}

export const sevRank: Record<Sev, number> = { high: 0, medium: 1, low: 2 };
