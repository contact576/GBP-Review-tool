"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Card, Input } from "@/components/ds";
import { Button } from "@/components/ds/Button";
import { Icon } from "@/components/icons";
import { connectWebsiteAction, setExcludedServicesAction } from "@/lib/actions";
import type { WebsiteEvidenceSnapshot } from "@/lib/data/types";

/**
 * Onboarding → Website.
 *
 * The owner types their address, Foundly reads the site right here (a few
 * pages, ten seconds or so) and shows exactly what it found: the services that
 * will appear on their review page, plus the contact facts and social links
 * that were cross-checked. Every service has a switch — a heading that was
 * mis-read as a service can be turned off on the spot. Nothing is typed in by
 * hand, and nothing is written back to the website or to Google.
 */

interface ScanSummary {
  snapshot: WebsiteEvidenceSnapshot;
  services: string[];
  message: string;
}

const SCAN_STAGES = [
  "Reaching your homepage",
  "Following your services pages",
  "Reading structured data",
  "Collecting what customers can pick from",
];

export function WebsitePanel({
  initialUrl,
  googleUrl,
  existing,
  initialExcluded,
}: {
  /** What the owner saved before, or "" */
  initialUrl: string;
  /** The website on the synced Google profile, if any — authoritative when set. */
  googleUrl: string | null;
  /** A previous crawl, so revisiting the step shows what is already known. */
  existing: WebsiteEvidenceSnapshot | null;
  initialExcluded: string[];
}) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl || googleUrl || "");
  const [result, setResult] = useState<ScanSummary | null>(
    existing && existing.status === "synced"
      ? { snapshot: existing, services: existing.facts.services, message: "" }
      : null,
  );
  const [error, setError] = useState<string | null>(
    existing && existing.status !== "synced" && existing.error ? existing.error : null,
  );
  const [excluded, setExcluded] = useState<Set<string>>(
    () => new Set(initialExcluded.map((value) => value.toLowerCase())),
  );
  const [scanning, startScanning] = useTransition();
  const [saving, startSaving] = useTransition();
  const [stage, setStage] = useState(0);

  function scan() {
    setError(null);
    setStage(0);
    const ticker = window.setInterval(() => {
      setStage((current) => Math.min(current + 1, SCAN_STAGES.length - 1));
    }, 1_800);
    startScanning(async () => {
      try {
        const outcome = await connectWebsiteAction(url);
        if (!outcome.ok) {
          setError(outcome.message);
          setResult(null);
        } else {
          setResult({ snapshot: outcome.snapshot, services: outcome.snapshot.facts.services, message: outcome.message });
        }
        router.refresh();
      } finally {
        window.clearInterval(ticker);
      }
    });
  }

  function toggle(label: string) {
    const key = label.toLowerCase();
    const next = new Set(excluded);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExcluded(next);
    startSaving(async () => {
      const all = result?.services ?? [];
      const outcome = await setExcludedServicesAction(all.filter((item) => next.has(item.toLowerCase())));
      if (!outcome.ok) setExcluded(excluded);
      router.refresh();
    });
  }

  const facts = result?.snapshot.facts;
  const detected = result?.services ?? [];
  const showing = detected.filter((item) => !excluded.has(item.toLowerCase()));
  const hostname = (value: string) => value.replace(/^https?:\/\//, "").replace(/\/$/, "");

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-[14px] font-semibold text-ink">Your website</span>
          <Input
            iconLeft="external"
            type="url"
            inputMode="url"
            autoComplete="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && url.trim() && !scanning) {
                event.preventDefault();
                scan();
              }
            }}
            placeholder="yourbusiness.com"
            disabled={scanning}
            aria-describedby="website-help"
          />
        </label>
        <p id="website-help" className="text-[12px] leading-relaxed text-faint">
          {googleUrl
            ? `Prefilled from your Google Business Profile (${hostname(googleUrl)}).`
            : "A bare domain is fine. We read a few public pages — nothing is changed on your site."}
        </p>
        <Button fullWidth icon={result ? "refresh" : "search"} loading={scanning} disabled={!url.trim() || scanning} onClick={scan}>
          {scanning ? "Reading your site…" : result ? "Scan again" : "Scan my website"}
        </Button>
      </Card>

      {scanning ? (
        <Card aria-busy className="space-y-2.5" role="status">
          {SCAN_STAGES.map((label, index) => (
            <div key={label} className="flex items-center gap-2.5 text-[13px]">
              <span
                className={
                  index < stage
                    ? "grid size-5 place-items-center rounded-full bg-primary text-white"
                    : index === stage
                      ? "size-5 animate-spin rounded-full border-2 border-primary border-t-transparent"
                      : "size-5 rounded-full border border-hairline"
                }
              >
                {index < stage ? <Icon name="check" size={12} /> : null}
              </span>
              <span className={index <= stage ? "font-semibold text-ink" : "text-faint"}>{label}</span>
            </div>
          ))}
        </Card>
      ) : null}

      {error && !scanning ? (
        <div className="flex items-start gap-2 rounded-card border border-danger/30 bg-danger-tint px-3.5 py-3 text-[13px] text-danger" role="alert">
          <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">We couldn&apos;t read that site</div>
            <p className="mt-0.5 leading-relaxed text-ink/80">{error}</p>
            <p className="mt-1 text-[12px] text-sub">
              Check the address, or skip this step — your Google profile and industry examples will
              supply the service list until a scan works.
            </p>
          </div>
        </div>
      ) : null}

      {result && !scanning ? (
        <div className="space-y-3 animate-slide-up">
          <div className="flex items-center gap-3 rounded-card border border-primary/30 bg-primary-tint px-4 py-3.5">
            <Icon name="check-circle" size={22} className="shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-bold text-primary-dark">
                Read {result.snapshot.pages.length} {result.snapshot.pages.length === 1 ? "page" : "pages"} of{" "}
                {hostname(result.snapshot.finalUrl ?? result.snapshot.requestedUrl ?? url)}
              </div>
              <div className="text-[12px] text-primary-dark/80">
                {detected.length > 0
                  ? `${detected.length} ${detected.length === 1 ? "service" : "services"} found — these become the "what did you come in for?" options.`
                  : "No service list found on these pages. Customers will pick from your Google profile or industry examples instead."}
              </div>
            </div>
            <Badge tone="primary" icon="check">Connected</Badge>
          </div>

          {detected.length > 0 ? (
            <Card className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[14px] font-bold text-ink">Services customers can pick</div>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-sub">
                    Switch off anything that isn&apos;t a service. Nothing is added by hand.
                  </p>
                </div>
                <span className="data-chip tabular-nums text-sub" aria-live="polite">
                  {showing.length}/{detected.length} showing
                </span>
              </div>
              <ul className="divide-y divide-hairline rounded-card border border-hairline">
                {detected.map((label) => {
                  const off = excluded.has(label.toLowerCase());
                  return (
                    <li key={label} className="flex items-center gap-3 px-3.5 py-2.5">
                      <span className={off ? "min-w-0 flex-1 truncate text-[14px] text-faint line-through" : "min-w-0 flex-1 truncate text-[14px] font-semibold text-ink"}>
                        {label}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!off}
                        aria-label={`${off ? "Show" : "Hide"} ${label}`}
                        disabled={saving}
                        onClick={() => toggle(label)}
                        className={off ? "relative h-6 w-11 shrink-0 rounded-full bg-hairline transition-colors disabled:opacity-60" : "relative h-6 w-11 shrink-0 rounded-full bg-primary transition-colors disabled:opacity-60"}
                      >
                        <span className={off ? "absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform" : "absolute left-0.5 top-0.5 size-5 translate-x-5 rounded-full bg-white shadow-sm transition-transform"} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}

          {facts && (facts.phones.length || facts.emails.length || facts.socialProfiles.length || facts.businessNames.length) ? (
            <Card className="space-y-2">
              <div className="text-[13px] font-bold text-ink">Also read, for cross-checking</div>
              <dl className="grid gap-x-4 gap-y-1.5 text-[13px] sm:grid-cols-[auto_1fr]">
                {facts.businessNames[0] ? (<><dt className="kicker normal-case">Name</dt><dd className="text-ink">{facts.businessNames[0]}</dd></>) : null}
                {facts.phones[0] ? (<><dt className="kicker normal-case">Phone</dt><dd className="tabular-nums text-ink">{facts.phones[0]}</dd></>) : null}
                {facts.emails[0] ? (<><dt className="kicker normal-case">Email</dt><dd className="text-ink">{facts.emails[0]}</dd></>) : null}
                {facts.socialProfiles.length ? (
                  <>
                    <dt className="kicker normal-case">Social</dt>
                    <dd className="text-ink">{facts.socialProfiles.map((profile) => hostname(profile)).join(" · ")}</dd>
                  </>
                ) : null}
              </dl>
              <p className="text-[12px] leading-relaxed text-faint">
                Used only to spot mismatches with your Google profile. Nothing is copied anywhere automatically.
              </p>
            </Card>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-start gap-2 rounded-btn border border-hairline bg-card px-3 py-2.5 text-[12px] text-sub">
        <Icon name="shield" size={15} className="mt-0.5 shrink-0 text-primary" />
        <span>
          We fetch public pages only, over a hardened crawler that refuses private addresses. Your
          site is read, never written to.
        </span>
      </div>
    </div>
  );
}
