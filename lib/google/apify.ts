import "server-only";

/**
 * Apify transport — the public-data substitute for the Business Profile API.
 *
 * GBP API access is granted per Cloud project and has not landed yet, so the
 * owned-profile sync 403s and the app falls back to a ≤5-review Places sample.
 * Apify's public Google Maps scrapers close most of that gap: the full review
 * history, arriving with Google's own review ids, plus attributes, hours, Q&A
 * and owner posts.
 *
 * What it deliberately does NOT do:
 *  - it never writes. Owner replies, local posts and profile edits stay on the
 *    governed GBP pipeline, which needs OAuth we don't have.
 *  - it cannot see owner-only surfaces (Performance metrics, search keywords,
 *    Google's pending suggested edits, the available-attribute catalogue).
 *    Those stay `not_authorized` in the snapshot rather than being zeroed.
 *
 * Without APIFY_TOKEN every entry point reports exactly what is missing and
 * does nothing — it never simulates a result.
 */

const API = "https://api.apify.com/v2";

/** Cost driver, measured: 20 images cost more than the whole place record.
 *  We take `imagesCount` from the place instead and skip the image payload. */
const PLACE_ACTOR = "compass~crawler-google-places";
/** $0.00004/review list — 12x cheaper than the official reviews Actor. */
const REVIEWS_ACTOR = "kaix~google-maps-reviews-scraper";

const TERMINAL = new Set(["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"]);

export type ApifyFailure =
  | { ok: false; reason: "not_configured"; detail: string }
  | { ok: false; reason: "error"; detail: string };

export type ApifyResult<T> = { ok: true; data: T; costUsd: number } | ApifyFailure;

export function isApifyConfigured(): boolean {
  return Boolean(process.env.APIFY_TOKEN);
}

function notConfigured(): ApifyFailure {
  return {
    ok: false,
    reason: "not_configured",
    detail:
      "Apify isn't configured — set APIFY_TOKEN to import Google reviews without Business Profile approval.",
  };
}

interface RunOutcome {
  items: unknown[];
  costUsd: number;
}

/**
 * Start an Actor and poll it to a terminal state.
 *
 * `waitForFinish` alone is not enough: when the account's concurrent-memory
 * quota is already committed a run sits in READY, and the create call then
 * returns a non-terminal status that reads like a failure. Polling waits a
 * queued run out instead of misreporting it.
 */
async function runActor(
  actor: string,
  input: Record<string, unknown>,
  timeoutMs: number,
): Promise<ApifyResult<unknown[]>> {
  const token = process.env.APIFY_TOKEN;
  if (!token) return notConfigured();

  const startedAt = Date.now();
  try {
    const created = await fetch(`${API}/acts/${actor}/runs?token=${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!created.ok) {
      return { ok: false, reason: "error", detail: `Apify ${actor}: HTTP ${created.status}` };
    }
    let run = ((await created.json()) as { data: ApifyRun }).data;

    while (!TERMINAL.has(run.status)) {
      if (Date.now() - startedAt > timeoutMs) {
        // Leave the run alone — it may still finish and bill; we just stop waiting.
        return {
          ok: false,
          reason: "error",
          detail: `Apify ${actor}: still ${run.status} after ${Math.round(timeoutMs / 1000)}s`,
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const polled = await fetch(`${API}/actor-runs/${run.id}?token=${token}`);
      if (!polled.ok) {
        return { ok: false, reason: "error", detail: `Apify ${actor}: HTTP ${polled.status} while polling` };
      }
      run = ((await polled.json()) as { data: ApifyRun }).data;
    }

    if (run.status !== "SUCCEEDED") {
      return { ok: false, reason: "error", detail: `Apify ${actor}: run ended ${run.status}` };
    }

    const items = await fetch(
      `${API}/datasets/${run.defaultDatasetId}/items?token=${token}&clean=true`,
    );
    if (!items.ok) {
      return { ok: false, reason: "error", detail: `Apify ${actor}: HTTP ${items.status} reading dataset` };
    }
    const parsed: unknown = await items.json();
    return {
      ok: true,
      data: Array.isArray(parsed) ? parsed : [],
      // Apify's own figure for what this run billed. Never estimated.
      costUsd: typeof run.usageTotalUsd === "number" ? run.usageTotalUsd : 0,
    };
  } catch (error) {
    return {
      ok: false,
      reason: "error",
      detail: `Apify ${actor}: ${error instanceof Error ? error.message : "request failed"}`,
    };
  }
}

interface ApifyRun {
  id: string;
  status: string;
  defaultDatasetId: string;
  usageTotalUsd?: number;
}

/** The place fields we read. Everything is optional — Google omits plenty. */
export interface ApifyPlace {
  title?: string;
  placeId?: string;
  cid?: string;
  url?: string;
  website?: string;
  phone?: string;
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  countryCode?: string;
  categoryName?: string;
  categories?: string[];
  description?: string;
  ownerDescription?: string;
  totalScore?: number;
  reviewsCount?: number;
  imagesCount?: number;
  claimThisBusiness?: boolean;
  permanentlyClosed?: boolean;
  temporarilyClosed?: boolean;
  location?: { lat?: number; lng?: number };
  openingHours?: Array<{ day?: string; hours?: string }>;
  additionalInfo?: Record<string, Array<Record<string, boolean>>>;
  questionsAndAnswers?: Array<{
    question?: string;
    askDate?: string;
    askedBy?: { name?: string; url?: string };
    answers?: Array<{ answer?: string; answerDate?: string; answeredBy?: { name?: string } }>;
  }>;
  ownerUpdates?: Array<{
    text?: string | null;
    postDate?: string;
    imageUrl?: string | null;
    buttonText?: string | null;
    buttonLink?: string | null;
  }>;
}

export interface ApifyReview {
  reviewId?: string;
  rating?: number;
  text?: string | null;
  publishedAt?: string;
  lastEditedAt?: string | null;
  url?: string;
  author?: { name?: string; id?: string };
  ownerResponse?: { text?: string; publishedAt?: string } | null;
}

/**
 * One place record, with detail-page fields (attributes, hours, Q&A, owner
 * posts, review histogram). Images are deliberately not requested.
 */
export async function fetchApifyPlace(placeId: string): Promise<ApifyResult<ApifyPlace>> {
  if (!isApifyConfigured()) return notConfigured();
  const run = await runActor(
    PLACE_ACTOR,
    {
      placeIds: [placeId],
      maxCrawledPlacesPerSearch: 1,
      scrapePlaceDetailPage: true,
      maxQuestions: 999,
      maxImages: 0,
      language: "en",
    },
    180_000,
  );
  if (!run.ok) return run;
  const place = run.data[0] as ApifyPlace | undefined;
  if (!place?.placeId) {
    return {
      ok: false,
      reason: "error",
      detail: `Google Maps returned no place for ${placeId}.`,
    };
  }
  return { ok: true, data: place, costUsd: run.costUsd };
}

/**
 * Review history, newest first.
 *
 * `maxReviews` bounds cost AND production — pass a small number for an
 * incremental sync and a large one only for the first full import.
 */
export async function fetchApifyReviews(
  placeId: string,
  maxReviews: number,
): Promise<ApifyResult<ApifyReview[]>> {
  if (!isApifyConfigured()) return notConfigured();
  const run = await runActor(
    REVIEWS_ACTOR,
    {
      urls: [`https://www.google.com/maps/place/?q=place_id:${placeId}`],
      maxReviews,
      sort: "newest",
      language: "en",
    },
    300_000,
  );
  if (!run.ok) return run;
  return { ok: true, data: run.data as ApifyReview[], costUsd: run.costUsd };
}
