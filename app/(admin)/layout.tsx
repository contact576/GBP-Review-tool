import { getSessionAndData } from "@/lib/data";
import { DemoBanner } from "@/components/app/DemoBanner";
import { AdminShell } from "./_components/AdminShell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { session } = await getSessionAndData();

  return (
    <>
      {session.isDemo ? <DemoBanner /> : null}
      <AdminShell>{children}</AdminShell>
    </>
  );
}
