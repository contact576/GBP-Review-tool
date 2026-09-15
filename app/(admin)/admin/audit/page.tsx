import { getPlatformAuditLog, getSessionAndData } from "@/lib/data";
import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ds/misc";
import { PlatformAuditTable } from "./PlatformAuditTable";

const LIMIT = 300;

export default async function AdminAuditPage() {
  const [{ session }, entries] = await Promise.all([getSessionAndData(), getPlatformAuditLog(LIMIT)]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit log"
        sub={
          session.isDemo
            ? "The demo shows its own workspace's ledger. On a real deployment this page reads every tenant's ledger, newest first."
            : `Privileged actions across every tenant — support sessions, plan changes, replies, captures, syncs — read from each tenant's append-only ledger. Newest ${LIMIT} entries.`
        }
        actions={
          <Badge tone="sub" icon="lock">
            {session.isDemo ? "Scope · demo workspace" : "Scope · all tenants"}
          </Badge>
        }
      />

      <PlatformAuditTable entries={entries} />
    </div>
  );
}
