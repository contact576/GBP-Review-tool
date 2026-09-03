/**
 * Apify-as-a-GBP-substitute probe.
 *
 * Answers one question with real data, not estimates: if Google Business
 * Profile API approval never lands, how much of `GbpProfileSnapshot` can we
 * fill from Apify's public Google Maps scrapers, and what does one sync cost?
 *
 * It runs two Actors against a single real place and reports (a) which snapshot
 * sources came back populated, (b) the exact USD Apify billed for the run
 * (read from the run's own `usageTotalUsd`, never estimated), and (c) the
 * sources that stay `unavailable` because no scraper can reach them.
 *
 * Usage:
 *   APIFY_TOKEN=apify_api_... node apify-gbp-probe.mjs --place ChIJ...
 *   APIFY_TOKEN=apify_api_... node apify-gbp-probe.mjs --search "Name, City"
 *   ... --reviews 200      (default 200; use 99999 for the full history)
 *
 * Get a token at https://console.apify.com/settings/integrations.
 */

const TOKEN = process.env.APIFY_TOKEN;
if (!TOKEN) {
  console.error("APIFY_TOKEN is not set — refusing to run. Nothing was measured.");
  process.exit(1);
}

const args = process.argv.slice(2);
const arg = (flag) => {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
};
const placeId = arg("--place");
const search = arg("--search");
const maxReviews = Number(arg("--reviews") ?? 200);
if (!placeId && !search) {
  console.error("Pass --place <ChIJ...> or --search \"Business Name, City\".");
  process.exit(1);
}

const API = "https://api.apify.com/v2";

const TERMINAL = new Set(["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"]);

/**
 * Start an Actor and poll to a terminal state.
 *
 * `waitForFinish` alone is not enough: a run can sit in READY when the account's
 * concurrent-memory quota is already committed, and the call then returns a
 * non-terminal status that looks like a failure. Poll instead so a queued run is
 * waited out rather than misreported.
 */
async function runActor(actor, input, { maxWaitSecs = 600 } = {}) {
  const path = actor.replace("/", "~");
  const started = Date.now();
  const res = await fetch(`${API}/acts/${path}/runs?token=${TOKEN}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`${actor}: HTTP ${res.status} ${await res.text()}`);
  let run = (await res.json()).data;

  let lastStatus = "";
  while (!TERMINAL.has(run.status)) {
    if ((Date.now() - started) / 1000 > maxWaitSecs) {
      throw new Error(`${actor}: run ${run.id} still ${run.status} after ${maxWaitSecs}s`);
    }
    if (run.status !== lastStatus) {
      process.stdout.write(`   ${run.status.toLowerCase()}…\n`);
      lastStatus = run.status;
    }
    await new Promise((r) => setTimeout(r, 5000));
    // Re-read: usageTotalUsd is only final once the run is terminal.
    run = (await (await fetch(`${API}/actor-runs/${run.id}?token=${TOKEN}`)).json()).data;
  }
  if (run.status !== "SUCCEEDED") {
    throw new Error(`${actor}: run ${run.id} ended ${run.status}`);
  }
  const itemsRes = await fetch(
    `${API}/datasets/${run.defaultDatasetId}/items?token=${TOKEN}&clean=true`,
  );
  const items = await itemsRes.json();
  return {
    runId: run.id,
    usd: run.usageTotalUsd ?? null,
    seconds: (Date.now() - started) / 1000,
    items,
  };
}

const placeInput = {
  ...(placeId ? { placeIds: [placeId] } : { searchStringsArray: [search] }),
  maxCrawledPlacesPerSearch: 1,
  scrapePlaceDetailPage: true,
  maxQuestions: 999,
  maxImages: 20,
  language: "en",
};

console.log("→ compass/crawler-google-places (profile snapshot)…");
const place = await runActor("compass/crawler-google-places", placeInput);
const p = place.items[0];
if (!p) {
  console.error("No place matched. Nothing was measured.");
  process.exit(1);
}

const mapsUrl =
  p.url ?? `https://www.google.com/maps/place/?q=place_id:${p.placeId}`;

console.log(`→ kaix/google-maps-reviews-scraper (${maxReviews} reviews)…`);
const reviews = await runActor("kaix/google-maps-reviews-scraper", {
  urls: [mapsUrl],
  maxReviews,
  sort: "newest",
  language: "en",
});

/** GbpProfileSnapshot.sourceStatus, filled only from what actually arrived. */
const has = (v) => (Array.isArray(v) ? v.length > 0 : v != null && v !== "");
const sourceStatus = {
  location: has(p.title) ? "synced" : "error",
  attributes: has(p.additionalInfo) ? "synced" : "unavailable",
  // Google only publishes attributes a business has SET. The "what else could
  // you fill in" list is owner-only, so completeness scoring stays partial.
  attributeMetadata: "unavailable",
  media: p.imagesCount > 0 ? "synced" : "unavailable",
  posts: has(p.ownerUpdates ?? p.updatesFromCustomers) ? "synced" : "unavailable",
  questions: has(p.questionsAndAnswers) ? "synced" : "unavailable",
  reviews: reviews.items.length > 0 ? "synced" : "unavailable",
  // Owner-only surfaces. No scraper can reach these; they are not rendered as
  // zero, they are rendered as not-measured.
  performance: "not_authorized",
  searchKeywords: "not_authorized",
  googleUpdates: "not_authorized",
};

const withOwnerReply = reviews.items.filter((r) => r.ownerResponse?.text).length;
const oldest = reviews.items.at(-1)?.publishedAt;
const totalUsd = (place.usd ?? 0) + (reviews.usd ?? 0);

console.log(`
PLACE       ${p.title} — ${p.address}
placeId     ${p.placeId}
rating      ${p.totalScore} from ${p.reviewsCount} reviews
claimed     ${p.claimThisBusiness === false ? "yes (owner-managed)" : "NO — unclaimed"}
categories  ${(p.categories ?? []).join(", ") || "—"}
histogram   ${JSON.stringify(p.reviewsDistribution ?? {})}

REVIEWS     ${reviews.items.length} imported (asked ${maxReviews})
  oldest    ${oldest ?? "—"}
  replied   ${withOwnerReply} (${((withOwnerReply / (reviews.items.length || 1)) * 100).toFixed(1)}% response rate)
  ids       ${reviews.items[0]?.reviewId ? "Google review ids present — vanish-diff safe" : "NO stable ids — durability unsafe"}

SOURCE STATUS`);
for (const [k, v] of Object.entries(sourceStatus)) {
  console.log(`  ${k.padEnd(18)} ${v}`);
}

console.log(`
COST (billed by Apify, read from the run — not estimated)
  place run   $${(place.usd ?? 0).toFixed(5)}  (${place.seconds.toFixed(0)}s, run ${place.runId})
  review run  $${(reviews.usd ?? 0).toFixed(5)}  (${reviews.seconds.toFixed(0)}s, run ${reviews.runId})
  TOTAL       $${totalUsd.toFixed(5)} for one full profile sync
  per 100 locations, daily: $${(totalUsd * 100 * 30).toFixed(2)}/month
`);
