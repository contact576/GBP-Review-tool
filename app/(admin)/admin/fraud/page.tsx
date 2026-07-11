import { getData } from "@/lib/data";
import { Icon } from "@/components/icons";
import { sevRank } from "../../_components/Severity";
import { FraudQueue } from "./FraudQueue";

export default async function AdminFraudPage() {
  const data = await getData();
  const flags = [...data.platform.fraudFlags].sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);
  const high = flags.filter((f) => f.severity === "high").length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-ink">Fraud queue</h1>
        <p className="text-[14px] text-sub">Suspicious review-capture signals awaiting triage. Highest severity first.</p>
      </div>

      <div className="flex items-start gap-2 rounded-card border border-hairline bg-primary-wash p-4 text-[13px] text-sub">
        <Icon name="shield" size={18} className="mt-px shrink-0 text-primary" />
        <p>
          {flags.length} open {flags.length === 1 ? "flag" : "flags"}
          {high > 0 ? ` · ${high} high-severity` : ""}. Signals include repeated device fingerprints, staff devices
          self-reviewing, and abnormal submission velocity — protecting review durability and Google policy compliance.
        </p>
      </div>

      <FraudQueue flags={flags} />
    </div>
  );
}
