import Image from "next/image";
import { getData } from "@/lib/data";
import type { GbpCapabilityStatus } from "@/lib/data/types";
import { Badge } from "@/components/ds/misc";
import { LinkButton } from "@/components/ds/Button";
import { ProgressMeter } from "@/components/charts";
import { Icon } from "@/components/icons";
import { BrandLogo } from "@/components/icons/brands";
import { formatRelative } from "@/lib/utils/format";
import { SettingsShell } from "../SettingsShell";
import { Callout, SettingsSection, SpecList, SpecRow } from "../SettingsUI";
import { SyncGoogleButton } from "@/components/app/SyncGoogleButton";
import { gbpServiceLabels, getIndustry, resolveServiceOptions } from "@/lib/industries";
import {
  AEO_QUESTION_LIMIT,
  REVIEW_PICKER_LIMIT,
} from "@/components/app/business-services";
import { BusinessDetailsForm } from "./BusinessDetailsForm";
import { DetectedServicesPanel, type DetectedService } from "./DetectedServicesPanel";

export default async function BusinessSettingsPage() {
  const data = await getData();
  const loc = data.location;
  const profile = loc.profile;
  const googleInt = (data.integrations ?? []).find((i) => i.provider === "google");
  const snapshot = loc.gbpSnapshot;
  const audit = loc.gbpAudit;

  // Services are read, never typed: the synced Google profile first, then the
  // website crawl. Both feed the customer review picker and the AI-Visibility
  // question set through `resolveServiceOptions`; the owner's only control is
  // switching a detected service off.
  const industry = getIndustry(data.workspace.vertical || loc.vertical);
  const excludedServices = data.workspace.industryConfig?.excludedServices ?? [];
  const websiteEvidence = loc.websiteEvidence;
  const detectedServices: DetectedService[] = (() => {
    const seen = new Set<string>();
    const out: DetectedService[] = [];
    const push = (label: string, source: DetectedService["source"]) => {
      const key = label.trim().toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push({ label: label.trim(), source });
    };
    for (const label of gbpServiceLabels(snapshot?.location.serviceItems)) push(label, "google_profile");
    for (const label of websiteEvidence?.facts.services ?? []) push(label, "website");
    return out;
  })();
  const resolvedServices = resolveServiceOptions({
    gbpServiceItems: snapshot?.location.serviceItems,
    websiteServices: websiteEvidence?.facts.services,
    ownerServices: data.workspace.industryConfig?.customServices,
    catalogServices: industry.services,
    excluded: excludedServices,
  });
  const websiteOnFile = snapshot?.location.websiteUri || loc.website || null;

  const rows: { label: string; value: string }[] = [
    { label: "Business name", value: loc.name },
    { label: "Primary category", value: profile.primaryCategory },
    { label: "Address", value: `${loc.address}, ${loc.city}` },
    { label: "Region", value: loc.region === "CA" ? "Canada" : "United States" },
    { label: "Description", value: profile.description },
    ...(snapshot?.location.phoneNumbers?.primaryPhone
      ? [{ label: "Primary phone", value: snapshot.location.phoneNumbers.primaryPhone }]
      : []),
    ...(snapshot?.location.websiteUri || loc.website
      ? [{
          label: "Website",
          value: snapshot?.location.websiteUri ?? `${loc.website} (entered by you)`,
        }]
      : []),
    ...(snapshot
      ? [{ label: "Google resource", value: snapshot.locationResource }]
      : []),
  ];

  return (
    <SettingsShell title="Business" sub="Your business profile and how Foundly connects to Google.">
      {/* GBP connection status — status row */}
      <SettingsSection title="Google Business Profile">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-btn border border-hairline bg-card">
              <BrandLogo name="google" size={22} title="" />
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
                  ? `Profile, media, reviews, and performance syncing${googleInt?.lastSyncAt ? ` · last sync ${formatRelative(googleInt.lastSyncAt)}` : ""}.`
                  : "Reconnect to resume review sync and Co-Pilot tasks."}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-start gap-2">
            {!data.workspace.isDemo ? <SyncGoogleButton variant="secondary" /> : null}
            <LinkButton
              href={loc.reviewUrl}
              target="_blank"
              variant="secondary"
              size="sm"
              iconRight="external"
            >
              View on Google
            </LinkButton>
          </div>
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
          Foundly never adds ranking keywords to your business name. A genuine real-world name correction requires confirmed evidence and explicit approval.
        </Callout>
      </SettingsSection>

      {/* Owner-entered facts — the only editable details until Google is connected */}
      <SettingsSection
        kicker="Entered by you"
        title="Details Google hasn't supplied"
        action={<Badge tone="neutral">Saved in Foundly</Badge>}
      >
        <BusinessDetailsForm
          website={loc.website ?? ""}
          ownerDescription={loc.ownerDescription ?? ""}
          googleWebsite={snapshot?.location.websiteUri}
        />
      </SettingsSection>

      {/* Detected services — read from Google and the website, never typed */}
      <SettingsSection
        kicker="Read from your Google profile and website"
        title="Services customers can pick"
        action={
          <Badge tone={detectedServices.length ? "primary" : "neutral"}>
            {detectedServices.length
              ? `${detectedServices.length} detected · ${resolvedServices.source === "catalog" ? 0 : resolvedServices.services.length} showing`
              : "Using industry examples"}
          </Badge>
        }
      >
        <p className="text-[14px] leading-relaxed text-sub">
          When a customer opens their review link, the first question is what they came in
          for. Those options are read from what you already publish — your Google Business
          Profile first, then your website — so they are real, in your words, and never typed
          in twice. Switch off anything that isn&apos;t a service.
        </p>

        <ul className="mt-4 space-y-2">
          <UsedInRow
            icon="chat"
            title="Review page service picker"
            detail={
              resolvedServices.source === "catalog"
                ? `Showing ${industry.label} examples until a real list is detected. Up to ${REVIEW_PICKER_LIMIT} options.`
                : `Showing ${Math.min(resolvedServices.services.length, REVIEW_PICKER_LIMIT)} real ${resolvedServices.services.length === 1 ? "option" : "options"} (${resolvedServices.fromGoogleProfile ? "Google profile" : "website"} first). The experience chips a customer sees are tuned to the one they pick.`
            }
          />
          <UsedInRow
            icon="sparkles"
            title="AI Visibility questions"
            detail={
              resolvedServices.source === "catalog"
                ? `Built from ${industry.label} examples until a real list is detected — the first ${AEO_QUESTION_LIMIT}.`
                : `Built from the first ${AEO_QUESTION_LIMIT} of the same list, same exclusions.`
            }
          />
        </ul>

        <div className="mt-4 border-t border-hairline pt-4">
          <DetectedServicesPanel
            detected={detectedServices}
            initialExcluded={excludedServices}
            websiteUrl={websiteOnFile}
            websiteScannedAt={websiteEvidence?.status === "synced" ? websiteEvidence.observedAt : null}
            websiteError={websiteEvidence && websiteEvidence.status !== "synced" ? websiteEvidence.error ?? "Could not read the site." : null}
            catalogExamples={[...industry.services]}
            industryLabel={industry.label}
          />
        </div>

        <Callout tone="info" icon="lock" className="mt-4">
          Read-only evidence. Nothing here is written to your Google Business Profile or your
          website; hiding a service only changes what Foundly shows.
        </Callout>
      </SettingsSection>

      {/* Profile completeness */}
      <SettingsSection kicker="Profile health" title="Applicable profile completion">
        <ProgressMeter
          value={profile.completeness}
          max={100}
          label="Applicable profile completion"
          valueText={`${profile.completeness}%`}
        />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Photos" value={profile.photoCount} />
          <Stat label="Posts" value={profile.postCount} />
          <Stat label="Q&A" value={profile.qnaCount} />
          <Stat label="Response rate" value={`${Math.round(profile.responseRate * 100)}%`} />
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-sub">
          Foundly scores only capabilities Google currently makes applicable to this location. Unsupported features are excluded, and unreadable sources stay unknown rather than being counted as missing.
        </p>
      </SettingsSection>

      {audit ? (
        <SettingsSection
          kicker={`Evidence audit ${formatRelative(audit.generatedAt)}`}
          title="Local growth audit"
          action={<Badge tone={audit.summary.criticalFindings ? "danger" : "primary"}>{audit.summary.openFindings} open opportunities</Badge>}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Evidence facts" value={audit.summary.evidenceFacts} />
            <Stat label="Open" value={audit.summary.openFindings} />
            <Stat label="Blocked on facts" value={audit.summary.blockedFindings} />
            <Stat label="Conflicts" value={audit.summary.conflicts} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(audit.sourceCoverage).map(([source, status]) => (
              <span key={source} className="inline-flex items-center gap-1.5 rounded-chip border border-hairline bg-paper px-2.5 py-1 text-[10px] font-semibold text-sub">
                <span className={`size-1.5 rounded-full ${status === "connected" ? "bg-primary" : status === "not_connected" ? "bg-faint" : "bg-gold"}`} />
                {source.replaceAll("_", " ")} · {status.replaceAll("_", " ")}
              </span>
            ))}
          </div>

          <div className="mt-4 space-y-2">
            {audit.findings.slice(0, 8).map((finding) => (
              <div key={finding.id} className="rounded-card border border-hairline bg-card p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-bold text-ink">{finding.title}</span>
                  <Badge tone={severityTone(finding.severity)}>{finding.severity}</Badge>
                  {finding.status === "blocked" ? <Badge tone="neutral">Needs evidence</Badge> : null}
                  <span className="ml-auto text-[10px] font-semibold tabular-nums text-faint">Priority {finding.priorityScore}</span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-sub">{finding.rationale}</p>
                <p className="mt-1.5 text-[10px] font-semibold text-faint">
                  {finding.evidenceIds.length} linked evidence {finding.evidenceIds.length === 1 ? "record" : "records"}
                  {finding.requiresOwnerFacts ? " · owner facts required" : ""}
                </p>
              </div>
            ))}
          </div>
          {audit.findings.length > 8 ? (
            <p className="mt-3 text-[11px] font-semibold text-sub">{audit.findings.length - 8} additional findings will appear in the suggestion inbox.</p>
          ) : null}
        </SettingsSection>
      ) : null}

      {snapshot?.externalEvidence ? (
        <SettingsSection
          kicker="Cross-source evidence"
          title="Website and search facts"
          action={<Badge tone="neutral">Read-only evidence</Badge>}
        >
          <div className="grid gap-3 lg:grid-cols-2">
            <EvidenceSourceCard
              icon="external"
              title="Business website"
              status={snapshot.externalEvidence.website.status}
              metric={`${snapshot.externalEvidence.website.pages.length} pages read`}
              detail={snapshot.externalEvidence.website.error ?? `${snapshot.externalEvidence.website.facts.services.length} service signals and ${snapshot.externalEvidence.website.facts.phones.length} phone values extracted.`}
              items={snapshot.externalEvidence.website.facts.services.slice(0, 3)}
            />
            <EvidenceSourceCard
              icon="search"
              title="Search Console"
              status={snapshot.externalEvidence.searchConsole.status}
              metric={`${snapshot.externalEvidence.searchConsole.rows.length} query rows`}
              detail={snapshot.externalEvidence.searchConsole.error ?? `Verified property ${snapshot.externalEvidence.searchConsole.siteUrl ?? "connected"}.`}
              items={snapshot.externalEvidence.searchConsole.rows.slice(0, 3).map((row) => `${row.query} · ${row.impressions} impressions`)}
            />
          </div>
          <Callout tone="info" icon="shield" className="mt-4">
            External sources are evidence only. Contradictions are blocked for owner confirmation, and no website or social claim is copied to Google automatically.
          </Callout>
        </SettingsSection>
      ) : null}

      {snapshot ? (
        <SettingsSection
          kicker={`Snapshot ${formatRelative(snapshot.syncedAt)}`}
          title="Google capability inventory"
          action={<Badge tone={snapshot.warnings.length ? "gold" : "primary"}>{snapshot.warnings.length ? `${snapshot.warnings.length} source warnings` : "All sources read"}</Badge>}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            {snapshot.capabilities.map((capability) => (
              <div key={capability.key} className="rounded-card border border-hairline bg-card p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13px] font-bold text-ink">{capability.label}</span>
                  <CapabilityStatus status={capability.status} />
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-sub">{capability.evidence}</p>
              </div>
            ))}
          </div>
          {snapshot.warnings.length ? (
            <Callout tone="warning" icon="alert" className="mt-4">
              <ul className="space-y-1">
                {snapshot.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </Callout>
          ) : null}
        </SettingsSection>
      ) : null}

      {snapshot?.media.length ? (
        <SettingsSection
          kicker="Original profile assets"
          title="Photos from Google"
          action={<Badge tone="neutral">{snapshot.media.length} synced</Badge>}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {snapshot.media.slice(0, 6).map((media) => (
              media.googleUrl ? (
                <div key={media.name} className="overflow-hidden rounded-card border border-hairline bg-primary-wash">
                  <div className="relative aspect-[4/3]">
                    <Image
                      src={media.googleUrl}
                      alt={`${loc.name} ${media.category?.toLowerCase() ?? "business"} photo from Google`}
                      fill
                      unoptimized
                      sizes="(min-width: 640px) 240px, 50vw"
                      className="object-cover"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 px-2.5 py-2 text-[10px] text-sub">
                    <span className="font-bold text-ink">{media.category ?? "PHOTO"}</span>
                    {media.attribution?.displayName ? <span className="truncate">{media.attribution.displayName}</span> : null}
                  </div>
                </div>
              ) : null
            ))}
          </div>
        </SettingsSection>
      ) : null}
    </SettingsShell>
  );
}

function CapabilityStatus({ status }: { status: GbpCapabilityStatus }) {
  const label = status === "not_applicable" ? "Not applicable" : `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
  const tone = status === "complete" ? "primary" : status === "partial" ? "gold" : status === "missing" ? "danger" : "neutral";
  return <Badge tone={tone}>{label}</Badge>;
}

function severityTone(severity: "low" | "medium" | "high" | "critical") {
  if (severity === "critical") return "danger" as const;
  if (severity === "high") return "gold" as const;
  if (severity === "medium") return "primary" as const;
  return "neutral" as const;
}

/** One "this list is read here" row, with the real rule that surface applies. */
function UsedInRow({
  icon,
  title,
  detail,
}: {
  icon: "chat" | "sparkles";
  title: string;
  detail: string;
}) {
  return (
    <li className="flex items-start gap-3 rounded-card border border-hairline bg-card p-3">
      <div className="grid size-8 shrink-0 place-items-center rounded-btn bg-primary-wash text-primary-dark">
        <Icon name={icon} size={16} />
      </div>
      <div className="min-w-0">
        <div className="text-[13px] font-bold text-ink">{title}</div>
        <p className="mt-0.5 text-[12px] leading-relaxed text-sub">{detail}</p>
      </div>
    </li>
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

function EvidenceSourceCard({
  icon,
  title,
  status,
  metric,
  detail,
  items,
}: {
  icon: "external" | "search" | "camera";
  title: string;
  status: "synced" | "not_connected" | "not_authorized" | "unavailable" | "error";
  metric: string;
  detail: string;
  items: string[];
}) {
  const connected = status === "synced";
  return (
    <div className="rounded-card border border-hairline bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-btn bg-primary-wash text-primary-dark"><Icon name={icon} size={17} /></div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><span className="text-[13px] font-bold text-ink">{title}</span><Badge tone={connected ? "primary" : status === "not_connected" ? "neutral" : "gold"}>{status.replaceAll("_", " ")}</Badge></div>
          <p className="mt-1 text-[11px] font-semibold text-ink">{metric}</p>
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-sub">{detail}</p>
      {items.length ? <ul className="mt-2 space-y-1 border-t border-hairline pt-2">{items.map((item) => <li key={item} className="line-clamp-2 text-[10px] leading-relaxed text-faint">{item}</li>)}</ul> : null}
    </div>
  );
}
