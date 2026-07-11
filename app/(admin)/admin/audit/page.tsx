import { getData } from "@/lib/data";
import { AuditTable } from "./AuditTable";

export default async function AdminAuditPage() {
  const data = await getData();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-ink">Audit log</h1>
        <p className="text-[14px] text-sub">Every privileged action — impersonation, replies, captures — written append-only and never edited.</p>
      </div>

      <AuditTable entries={data.auditLog} />
    </div>
  );
}
