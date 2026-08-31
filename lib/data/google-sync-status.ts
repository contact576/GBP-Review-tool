import type { Integration } from "./types";

/**
 * The single source of truth for what the Google integration tile says after a
 * sync — shared so the memory and Drizzle providers cannot drift.
 *
 * They had already drifted: memory reported "synced — N reviews and
 * performance" while Drizzle reported only "synced — N reviews", and memory
 * assigned `detail` twice with the first assignment dead. Worse, both claimed a
 * Business Profile sync even when the numbers came from a public scrape, which
 * would tell an owner their views and calls were being measured when nothing
 * was measuring them.
 */

export interface GoogleSyncStatusInput {
  /** Where the snapshot's facts came from, when there is a snapshot. */
  source?: "google_business_profile" | "google_public_scrape";
  /** Google's own aggregate review count, when known. */
  reviewCount?: number;
  /** Why the Performance API could not be read, if it could not. */
  performanceError?: string;
}

function isPublicScrape(input: GoogleSyncStatusInput): boolean {
  return input.source === "google_public_scrape";
}

/**
 * `connected` is reserved for a real owned sync with performance data. A public
 * import is deliberately `needs_attention`: it works, but Business Profile
 * approval is still outstanding and the owner should know that.
 */
export function googleIntegrationStatus(input: GoogleSyncStatusInput): Integration["status"] {
  if (isPublicScrape(input)) return "needs_attention";
  return input.performanceError ? "needs_attention" : "connected";
}

export function googleIntegrationDetail(
  input: GoogleSyncStatusInput,
  importedCount: number,
): string {
  const reviews = input.reviewCount ?? importedCount;
  if (isPublicScrape(input)) {
    return `${reviews} reviews imported from public Google data — views, calls and direction requests need Business Profile approval and are not measured`;
  }
  if (input.performanceError) {
    return `Reviews synced; Business Profile performance unavailable — ${input.performanceError}`;
  }
  return `Google Business Profile synced — ${reviews} reviews and performance`;
}
