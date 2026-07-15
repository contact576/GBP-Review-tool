import { getSessionAndData } from "@/lib/data";
import { DemoBanner } from "@/components/app/DemoBanner";
import { AgencyShell } from "./_components/AgencyShell";

export default async function AgencyLayout({ children }: { children: React.ReactNode }) {
  const { session, data } = await getSessionAndData();
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
