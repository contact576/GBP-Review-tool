import { NextResponse } from "next/server";
import { getPublicProviders } from "@/lib/data";
import { parseUnsubscribeToken } from "@/lib/campaigns/unsubscribe";
import { consumeRateLimit } from "@/lib/security/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The opt-out endpoint every marketing email points at.
 *
 * CAN-SPAM §7704(a)(3) and CASL both require a working opt-out, so this route
 * is deliberately the least fragile thing in the app: no session, no database
 * lookup table, no expiry. The token is HMAC-signed and self-describing, and
 * the only mutation it can cause is switching marketing consent OFF — the safe
 * direction.
 *
 * GET handles the link a person clicks. POST handles RFC 8058 one-click, which
 * Gmail and Yahoo now expect on bulk mail. Both do the same thing, and both are
 * idempotent: unsubscribing twice is a success, not an error.
 *
 * Service consent is left alone on purpose. Opting out of marketing must not
 * silently stop the review request for a visit the customer already agreed to.
 */

type Outcome =
  | { ok: true; alreadyOff: boolean }
  | { ok: false; reason: "invalid" | "not_found" | "rate_limited" };

function clientIdentity(request: Request): string {
  const headers = request.headers;
  return (
    headers.get("cf-connecting-ip") ||
    headers.get("x-real-ip") ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

async function applyUnsubscribe(request: Request): Promise<Outcome> {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  const rate = consumeRateLimit("unsubscribe", clientIdentity(request), 60, 10 * 60_000);
  if (!rate.allowed) return { ok: false, reason: "rate_limited" };

  const claims = parseUnsubscribeToken(token);
  if (!claims) return { ok: false, reason: "invalid" };

  // The link has no session, so both stores are checked — the same pattern the
  // public review-token surfaces use.
  for (const provider of await getPublicProviders()) {
    const data = await provider.getData(claims.workspaceId);
    const customer = data?.customers.find((item) => item.id === claims.customerId);
    if (!customer) continue;
    if (!customer.consent.marketingConsent) return { ok: true, alreadyOff: true };
    await provider.updateConsent(claims.workspaceId, claims.customerId, {
      marketingConsent: false,
      marketingConsentAt: undefined,
      consentSourceText: `${customer.consent.consentSourceText} Marketing consent withdrawn by the customer via the unsubscribe link on ${new Date().toISOString().slice(0, 10)}.`,
    });
    return { ok: true, alreadyOff: false };
  }
  return { ok: false, reason: "not_found" };
}

const PAGE_STYLE =
  "margin:0;min-height:100vh;display:grid;place-items:center;background:#F7F6F2;font-family:Helvetica,Arial,sans-serif;color:#17201D";
const CARD_STYLE =
  "max-width:440px;margin:24px;background:#fff;border:1px solid #E7E5DE;border-radius:16px;padding:32px;text-align:center";

function page(title: string, body: string, status: number): NextResponse {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="robots" content="noindex"/><title>${title}</title></head>
<body style="${PAGE_STYLE}"><main style="${CARD_STYLE}">
  <div style="font-size:20px;font-weight:800;margin-bottom:10px">${title}</div>
  <p style="font-size:15px;line-height:1.6;color:#5C6663;margin:0">${body}</p>
</main></body></html>`;
  return new NextResponse(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function renderOutcome(outcome: Outcome): NextResponse {
  if (outcome.ok) {
    return page(
      "You're unsubscribed",
      outcome.alreadyOff
        ? "You were already opted out of marketing messages from this business. Nothing more is needed."
        : "You will not receive further marketing messages from this business. Messages about a visit you have booked are unaffected.",
      200,
    );
  }
  if (outcome.reason === "rate_limited") {
    return page("Too many requests", "Please wait a moment and try the link again.", 429);
  }
  return page(
    "This link didn't work",
    "The unsubscribe link is invalid or has already been replaced. Reply to the email and the business will remove you directly.",
    400,
  );
}

export async function GET(request: Request): Promise<NextResponse> {
  return renderOutcome(await applyUnsubscribe(request));
}

/** RFC 8058 one-click. Mail clients expect a bare 200, not a page. */
export async function POST(request: Request): Promise<NextResponse> {
  const outcome = await applyUnsubscribe(request);
  return NextResponse.json(
    outcome.ok ? { ok: true } : { ok: false, error: outcome.reason },
    { status: outcome.ok ? 200 : outcome.reason === "rate_limited" ? 429 : 400 },
  );
}
