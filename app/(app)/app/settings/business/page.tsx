import { getData } from "@/lib/data";
import { Card, CardHeader } from "@/components/ds/Card";
import { Badge } from "@/components/ds/misc";
import { PageHeader } from "@/components/app/PageHeader";
import { LinkButton } from "@/components/ds/Button";
import { Icon } from "@/components/icons";
import { formatRelative } from "@/lib/utils/format";
import { SettingsNav } from "../SettingsNav";

export default async function BusinessSettingsPage() {
  const data = await getData();
  const loc = data.location;
  const profile = loc.profile;
  const googleInt = (data.integrations ?? []).find((i) => i.provider === "google");

  const rows: { label: string; value: string }[] = [
    { label: "Business name", value: loc.name },
    { label: "Primary category", value: profile.primaryCategory },
    { label: "Address", value: `${loc.address}, ${loc.city}` },
    { label: "Region", value: loc.region === "CA" ? "Canada" : "United States" },
    { label: "Description", value: profile.description },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" sub="Your business profile and how Foundly connects to Google." />

      <SettingsNav />

      {/* GBP connection status */}
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-btn bg-primary-tint text-primary-dark">
              <Icon name="google" size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[16px] font-bold text-ink">Google Business Profile</span>
                {loc.gbpConnected ? (
                  <Badge tone="primary" icon="check-circle">Connected</Badge>
                ) : (
                  <Badge tone="danger" icon="alert">Disconnected</Badge>
                )}
              </div>
              <p className="mt-0.5 text-[14px] text-sub">
                {loc.gbpConnected
                  ? `Reviews and performance syncing${googleInt?.lastSyncAt ? ` · last sync ${formatRelative(googleInt.lastSyncAt)}` : ""}.`
                  : "Reconnect to resume review sync and Co-Pilot tasks."}
              </p>
            </div>
          </div>
          <LinkButton
            href={loc.reviewUrl}
            target="_blank"
            variant="secondary"
            size="sm"
            iconRight="external"
            className="shrink-0"
          >
            View on Google
          </LinkButton>
        </div>
      </Card>

      {/* Profile details */}
      <Card>
        <CardHeader
          title="Business details"
          action={<Badge tone="neutral">Synced from Google</Badge>}
        />
        <dl className="divide-y divide-hairline">
          {rows.map((row) => (
            <div key={row.label} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:gap-4">
              <dt className="w-40 shrink-0 text-[12px] font-semibold uppercase tracking-wide text-faint">
                {row.label}
              </dt>
              <dd className="text-[15px] text-ink">{row.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 flex items-center gap-1.5 text-[13px] text-faint">
          <Icon name="lock" size={13} /> We never edit your business name — that would violate Google policy.
        </p>
      </Card>

      {/* Profile completeness */}
      <Card>
        <CardHeader kicker="Profile health" title="Completeness" />
        <div className="mb-4 flex items-center gap-3">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-primary-wash">
            <div className="h-full rounded-full bg-primary" style={{ width: `${profile.completeness}%` }} />
          </div>
          <span className="text-[16px] font-bold tabular-nums text-ink">{profile.completeness}%</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Photos" value={profile.photoCount} />
          <Stat label="Posts" value={profile.postCount} />
          <Stat label="Q&A" value={profile.qnaCount} />
          <Stat label="Response rate" value={`${Math.round(profile.responseRate * 100)}%`} />
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-card border border-hairline bg-card p-3 text-center">
      <div className="text-[20px] font-extrabold leading-none tabular-nums text-ink">{value}</div>
      <div className="mt-1 text-[12px] text-faint">{label}</div>
    </div>
  );
}
