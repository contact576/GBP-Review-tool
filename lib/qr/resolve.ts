import { getPublicProviders } from "@/lib/data";
import { resolveDegradedScanContext } from "./degrade";
import { readQrScanContext, recordQrPageOpen } from "./store";
import type { QrHitKind } from "./scan-signal";

/**
 * Where a public QR scan should be sent, and what it should count as.
 *
 * One place decides both, so the analytics the owner sees and the destination
 * the customer gets can never drift apart.
 */
export type QrScanDestination =
  | {
      kind: "review_session";
      token: string;
      business: string;
      /** True when this scan also counted as a review-page open. */
      countedOpen: boolean;
    }
  | {
      kind: "google_review";
      url: string;
      graceEndsAt: string | null;
      basis: "within_grace" | "lapse_date_unknown";
    }
  | {
      kind: "expired";
      reason: "unknown_slug" | "grace_elapsed" | "no_review_url";
    };

export interface ResolveQrScanInput {
  slug: string;
  /** How the short link was hit — decides whether an open is counted. */
  hit: QrHitKind;
  /** Injectable clock for tests. */
  now?: Date | string;
}

/**
 * Resolution order:
 *  1. Try to mint a live review session (the normal path for an active code).
 *     The provider counts the scan and refuses to mint for a degraded asset or
 *     a lapsed subscription.
 *  2. If nothing minted, look the slug up. A known slug that refused to mint is
 *     a degraded code — send it to the business's public Google review page
 *     while the grace window is open.
 *  3. Otherwise the honest expired page. A scan never dead-ends on an error.
 */
export async function resolveQrScan(input: ResolveQrScanInput): Promise<QrScanDestination> {
  const slug = input.slug?.trim();
  if (!slug) return { kind: "expired", reason: "unknown_slug" };

  for (const provider of await getPublicProviders()) {
    try {
      const minted = await provider.mintRequestFromQrSlug(slug);
      if (minted) {
        let countedOpen = false;
        if (input.hit === "browser_navigation") {
          countedOpen = await recordQrPageOpen(slug);
        }
        return {
          kind: "review_session",
          token: minted.token,
          business: minted.business,
          countedOpen,
        };
      }
    } catch {
      // This store couldn't resolve the slug — try the next one.
    }
  }

  const context = await readQrScanContext(slug);
  if (!context) return { kind: "expired", reason: "unknown_slug" };

  const outcome = resolveDegradedScanContext(context, input.now);
  if (outcome.kind === "google_review") {
    return {
      kind: "google_review",
      url: outcome.url,
      graceEndsAt: outcome.graceEndsAt,
      basis: outcome.basis,
    };
  }
  return { kind: "expired", reason: outcome.reason };
}
