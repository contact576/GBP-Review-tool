import { getData } from "@/lib/data";
import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ds/misc";
import { AuditTable } from "./AuditTable";

export default async function AdminAuditPage() {
  const data = await getData();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit log"
        sub="Privileged actions — replies, captures, sync runs — written append-only and never edited. This is a real ledger read from the workspace record, not an aggregate."
        actions={<Badge tone="sub" icon="lock">Scope · this workspace</Badge>}
      />

      <AuditTable entries={data.auditLog} />
    </div>
  );
}
