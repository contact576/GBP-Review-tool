/**
 * The one place the "Send test SMS" result is encoded and decoded.
 *
 * SMS has no per-workspace credential row (Twilio is platform env config), so
 * the only durable, provider-neutral slot for "did the last test go through" is
 * the `twilio` integration tile's `detail` string, written through
 * `setIntegrationStatus`. Both the Channels panel and the integrations
 * reconciler (`lib/data/integration-status.ts`) parse it back with these
 * helpers, so the stored text is the contract — change it here only.
 *
 * Honesty note: Twilio *accepting* a message is not delivery. The status
 * callback that would upgrade it to "delivered" only exists for real review
 * requests, so a test can truthfully claim "accepted — check the handset" and
 * nothing more.
 */

const PREFIX = "Test SMS";
const ACCEPTED = `${PREFIX} accepted by Twilio`;
const FAILED = `${PREFIX} failed`;

export type SmsTestResult =
  | { ok: true; to: string; sid: string }
  | { ok: false; to: string; error: string };

/** `••••0123` — enough for the owner to recognise the handset, nothing more. */
export function maskPhone(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  return `••••${digits.slice(-4)}`;
}

export function formatSmsTestDetail(result: SmsTestResult): string {
  const to = maskPhone(result.to);
  if (result.ok) return `${ACCEPTED} for ${to} (${result.sid}) — check the handset`;
  return `${FAILED} for ${to}: ${result.error.slice(0, 240)}`;
}

export interface ParsedSmsTest {
  ok: boolean;
  /** Masked recipient, e.g. `••••0123`. */
  to: string;
  /** Twilio message sid on success; the error text on failure. */
  note: string;
}

/** Inverse of `formatSmsTestDetail`; null for any detail that is not a test result. */
export function parseSmsTestDetail(detail: string | undefined | null): ParsedSmsTest | null {
  if (!detail || !detail.startsWith(PREFIX)) return null;
  const accepted = detail.match(/^Test SMS accepted by Twilio for (\S+) \(([^)]+)\)/);
  if (accepted) return { ok: true, to: accepted[1] ?? "", note: accepted[2] ?? "" };
  const failed = detail.match(/^Test SMS failed for (\S+): ([\s\S]*)$/);
  if (failed) return { ok: false, to: failed[1] ?? "", note: failed[2] ?? "" };
  return null;
}
