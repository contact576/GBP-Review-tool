import { getData } from "@/lib/data";
import { Badge } from "@/components/ds/misc";
import { LinkButton } from "@/components/ds/Button";
import { ProgressMeter } from "@/components/charts";
import { Icon } from "@/components/icons";
import { formatRelative } from "@/lib/utils/format";
import { SettingsShell } from "../SettingsShell";
import { Callout, SettingsSection, SpecList, SpecRow } from "../SettingsUI";

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
    <SettingsShell title="Business" sub="Your business profile and how Foundly connects to Google.">
      {/* GBP connection status — status row */}
      <SettingsSection title="Google Business Profile">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-btn bg-primary-tint text-primary-dark">
              <Icon name="google" size={20} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] font-bold text-ink">Business Profile sync</span>
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
      </SettingsSection>

      {/* Profile details — key/value spec rows */}
      <SettingsSection
        title="Business details"
        action={<Badge tone="neutral">Synced from Google</Badge>}
      >
        <SpecList>
          {rows.map((row) => (
            <SpecRow key={row.label} label={row.label}>
              {row.value}
            </SpecRow>
          ))}
        </SpecList>
        <Callout tone="info" icon="lock" className="mt-4">
          We never edit your business name — that would violate Google policy.
        </Callout>
      </SettingsSection>

      {/* Profile completeness */}
      <SettingsSection kicker="Profile health" title="Completeness">
        <ProgressMeter
          value={profile.completeness}
          max={100}
          label="Profile completeness"
          valueText={`${profile.completeness}%`}
        />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Photos" value={profile.photoCount} />
          <Stat label="Posts" value={profile.postCount} />
          <Stat label="Q&A" value={profile.qnaCount} />
          <Stat label="Response rate" value={`${Math.round(profile.responseRate * 100)}%`} />
        </div>
      </SettingsSection>
    </SettingsShell>
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
