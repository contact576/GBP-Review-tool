/**
 * Telling a QR *scan* apart from a review-page *open*.
 *
 * A single hit on /q/{slug} is NOT proof that a person saw the review page.
 * Camera apps, iOS/Android link previews, messenger unfurlers (Slack,
 * WhatsApp, Signal), uptime monitors and security scanners all fetch the short
 * link without any human ever arriving. Counting those as "opens" is what made
 * the open rate sit at exactly 100% and say nothing.
 *
 * So:
 *  - every resolution of the short link counts as a SCAN;
 *  - only a genuine top-level browser navigation — the request that is handed
 *    the live review session — counts as an OPEN.
 *
 * Classification uses Fetch Metadata (`Sec-Fetch-*`), which every current
 * browser sends on navigations and no unfurler forges, and falls back to
 * Accept/User-Agent inspection for older clients.
 */

export type QrHitKind = "browser_navigation" | "background_fetch";

export interface QrHitSignal {
  method: string;
  headers: Headers;
}

/** Agents that fetch links for previews, indexing or monitoring — never opens. */
const NON_HUMAN_UA =
  /bot\b|crawler|spider|slurp|facebookexternalhit|slackbot|whatsapp|telegram|discord|twitterbot|linkedinbot|embedly|skypeuripreview|bitlybot|preview|pingdom|uptime|monitor|scanner|curl\/|wget\/|python-requests|okhttp|axios\/|node-fetch|go-http-client|headless/i;

function isPrefetch(headers: Headers): boolean {
  const secPurpose = headers.get("sec-purpose") ?? "";
  if (secPurpose.includes("prefetch") || secPurpose.includes("prerender")) return true;
  const purpose = headers.get("purpose") ?? headers.get("x-purpose") ?? "";
  if (purpose.toLowerCase().includes("prefetch")) return true;
  const moz = headers.get("x-moz") ?? "";
  return moz.toLowerCase().includes("prefetch");
}

/**
 * Whether this request is a real browser navigating to the review page.
 * Anything uncertain is classified as a background fetch — an open must be
 * earned, never assumed.
 */
export function classifyQrHit(request: QrHitSignal): QrHitKind {
  const method = (request.method || "GET").toUpperCase();
  if (method !== "GET") return "background_fetch";

  const headers = request.headers;
  if (isPrefetch(headers)) return "background_fetch";

  const dest = headers.get("sec-fetch-dest");
  const mode = headers.get("sec-fetch-mode");
  if (dest || mode) {
    // Fetch Metadata present: trust it exactly.
    const isDocument = dest === null || dest === "document";
    const isNavigate = mode === null || mode === "navigate";
    return isDocument && isNavigate ? "browser_navigation" : "background_fetch";
  }

  // No Fetch Metadata (older browsers, most bots). Require an HTML-seeking
  // request from a user agent that is not a known non-human fetcher.
  const accept = headers.get("accept") ?? "";
  if (!accept.includes("text/html")) return "background_fetch";
  const ua = headers.get("user-agent") ?? "";
  if (!ua || NON_HUMAN_UA.test(ua)) return "background_fetch";
  return "browser_navigation";
}
