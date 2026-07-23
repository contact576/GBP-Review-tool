import { redirect } from "next/navigation";
import { getSessionAndData } from "@/lib/data";
import { DemoBanner } from "@/components/app/DemoBanner";
import { AdminShell } from "./_components/AdminShell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { session } = await getSessionAndData();
  // Defense in depth (V9): the platform console previously relied solely on the
  // middleware role check. Re-assert it here so a middleware bypass (e.g. a
  // future Next.js CVE) cannot expose the admin surface. Mirrors the agency
  // layout's own re-check.
  if (session.role !== "platform_admin") redirect("/app");

  return (
    <>
      {session.isDemo ? <DemoBanner /> : null}
      <AdminShell>{children}</AdminShell>
    </>
  );
}
