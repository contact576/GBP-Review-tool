import { getData } from "@/lib/data";
import { AgencyShell } from "./_components/AgencyShell";

export default async function AgencyLayout({ children }: { children: React.ReactNode }) {
  const data = await getData();
  const wl = data.agency.whiteLabel;

  return (
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
  );
}
