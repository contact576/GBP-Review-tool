import { getData } from "@/lib/data";
import { FlagsTable } from "./FlagsTable";

export default async function AdminFlagsPage() {
  const data = await getData();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-ink">Feature flags</h1>
        <p className="text-[14px] text-sub">Roll capabilities out by cohort. Toggles are local in this demo — no tenant is affected.</p>
      </div>

      <FlagsTable flags={data.featureFlags} />
    </div>
  );
}
