"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ds/Button";
import { Badge } from "@/components/ds/misc";
import { useToast } from "@/components/ds/Toast";
import { Icon, type IconName } from "@/components/icons";
import { REVIEW_PICKER_LIMIT } from "@/components/app/business-services";
import { formatRelative } from "@/lib/utils/format";
import { rescanWebsiteAction, setExcludedServicesAction } from "@/lib/actions";

export interface DetectedService {
  label: string;
  source: "google_profile" | "website";
}

const SOURCE_META: Record<DetectedService["source"], { label: string; icon: IconName }> = {
  google_profile: { label: "Google profile", icon: "google" },
  website: { label: "Your website", icon: "external" },
};

/**
 * The services a customer can pick from — read, never typed.
 *
 * Two real sources feed the list (the synced Google profile, then the website
 * crawl) and the owner's one control is the switch on each row: a detected
 * service they turn off is hidden everywhere it is read (review page, AI
 * Visibility questions). There is deliberately no "add a service" input;
 * the way to add one is to publish it on Google or on the website and rescan.
 */
export function DetectedServicesPanel({
  detected,
  initialExcluded,
  websiteUrl,
  websiteScannedAt,
  websiteError,
  catalogExamples,
  industryLabel,
}: {
  detected: DetectedService[];
  initialExcluded: string[];
  /** The website on file (Google's if synced, else the owner's), or null. */
  websiteUrl: string | null;
  websiteScannedAt: string | null;
  websiteError: string | null;
  /** Catalog stand-ins shown only while nothing real is detected. */
  catalogExamples: string[];
  industryLabel: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [excluded, setExcluded] = useState<Set<string>>(
    () => new Set(initialExcluded.map((value) => value.toLowerCase())),
  );
  const [saving, startSaving] = useTransition();
  const [scanning, startScanning] = useTransition();

  const visible = useMemo(
    () => detected.filter((item) => !excluded.has(item.label.toLowerCase())),
    [detected, excluded],
  );
  const shownOnReviewPage = visible.slice(0, REVIEW_PICKER_LIMIT);

  function toggle(item: DetectedService) {
    const key = item.label.toLowerCase();
    const next = new Set(excluded);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExcluded(next);
    startSaving(async () => {
      const list = detected
        .filter((entry) => next.has(entry.label.toLowerCase()))
        .map((entry) => entry.label);
      const result = await setExcludedServicesAction(list);
      if (!result.ok) {
        // Roll back to what the server still has.
        setExcluded(excluded);
        toast(result.message, "danger", "alert");
        return;
      }
      router.refresh();
    });
  }

  function rescan() {
    startScanning(async () => {
      const result = await rescanWebsiteAction();
      toast(result.message, result.ok ? "success" : "warning", result.ok ? "check-circle" : "alert");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {detected.length > 0 ? (
        <>
          <ul className="divide-y divide-hairline rounded-card border border-hairline bg-card">
            {detected.map((item) => {
              const off = excluded.has(item.label.toLowerCase());
              const meta = SOURCE_META[item.source];
              const rank = shownOnReviewPage.findIndex((entry) => entry.label === item.label);
              return (
                <li key={`${item.source}:${item.label}`} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className={cn("truncate text-[15px] font-semibold", off ? "text-faint line-through" : "text-ink")}>
                      {item.label}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-faint">
                      <Icon name={meta.icon} size={12} />
                      {meta.label}
                      {!off && rank >= 0 ? (
                        <span className="data-chip">· option {rank + 1} on the review page</span>
                      ) : !off ? (
                        <span>· beyond the first {REVIEW_PICKER_LIMIT}, not shown</span>
                      ) : (
                        <span>· hidden</span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!off}
                    aria-label={`${off ? "Show" : "Hide"} ${item.label}`}
                    disabled={saving}
                    onClick={() => toggle(item)}
                    className={cn(
                      "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60",
                      off ? "bg-hairline" : "bg-primary",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform",
                        off ? "left-0.5" : "left-0.5 translate-x-5",
                      )}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-[12px] leading-relaxed text-sub">
            <span className="tabular-nums font-semibold text-ink">{shownOnReviewPage.length}</span> of{" "}
            <span className="tabular-nums">{detected.length}</span> detected services appear on your review
            page{visible.length > REVIEW_PICKER_LIMIT ? ` (the first ${REVIEW_PICKER_LIMIT})` : ""}. Turn one off to
            hide it everywhere Foundly reads this list.
          </p>
        </>
      ) : (
        <div className="rounded-card border border-dashed border-hairline bg-paper p-4">
          <div className="text-[14px] font-bold text-ink">No services detected yet</div>
          <p className="mt-1 text-[13px] leading-relaxed text-sub">
            Until your Google profile or website supplies a list, customers pick from typical examples
            for {industryLabel}:
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {catalogExamples.slice(0, REVIEW_PICKER_LIMIT).map((example) => (
              <Badge key={example} tone="neutral">{example}</Badge>
            ))}
          </div>
          <p className="mt-2.5 text-[12px] text-faint">
            These are our guess at a typical business, not a record of what you sell.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-card border border-hairline bg-primary-wash/40 p-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-ink">
            <Icon name="external" size={15} className="text-primary" />
            {websiteUrl ? (
              <a href={websiteUrl} target="_blank" rel="noreferrer" className="truncate underline-offset-2 hover:underline">
                {websiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </a>
            ) : (
              "No website on file"
            )}
          </div>
          <p className="mt-0.5 text-[12px] leading-relaxed text-sub">
            {websiteError
              ? `Last scan failed: ${websiteError}`
              : websiteScannedAt
                ? `Last read ${formatRelative(websiteScannedAt)}. Changed your site? Rescan to pick up new services.`
                : websiteUrl
                  ? "Not scanned yet. Scan to read the services listed on your site."
                  : "Add your website above, then scan it to read your services."}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon="refresh"
          loading={scanning}
          disabled={!websiteUrl || scanning}
          onClick={rescan}
          className="shrink-0"
        >
          {websiteScannedAt ? "Rescan website" : "Scan website"}
        </Button>
      </div>
    </div>
  );
}
