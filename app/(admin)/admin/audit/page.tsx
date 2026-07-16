import { getData } from "@/lib/data";
import { PageHeader } from "@/components/app/PageHeader";
import { AuditTable } from "./AuditTable";

export default async function AdminAuditPage() {
  const data = await getData();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit log"
        sub="Every privileged action — impersonation, replies, captures — written append-only and never edited."
      />

      <AuditTable entries={data.auditLog} />
    </div>
  );
}
