import { getSessionAndData } from "@/lib/data";
import { DemoBanner } from "@/components/app/DemoBanner";
import { AgencyShell } from "./_components/AgencyShell";
import { redirect } from "next/navigation";

export default async function AgencyLayout({ children }: { children: React.ReactNode }) {
  const { session, data } = await getSessionAndData();
  if (session.role !== "agency_admin" && data.subscription.tier !== "agency") redirect("/app");
  const wl = data.agency.whiteLabel;

  return (
    <>
      {session.isDemo ? <DemoBanner /> : null}
      <AgencyShell
        brand={{
          brandName: wl.brandName,
          primary: wl.primary,
          accent: wl.accent,
          logoText: wl.logoText,
        }}
      >
        {children}
      </AgencyShell>
    </>
  );
}
