import { canonicalPhone } from "@/lib/sms/phone";
import type { Region } from "@/lib/data/types";

/**
 * WhatsApp click-to-chat links — the whole no-API WhatsApp channel.
 *
 * WhatsApp's Business API needs a Meta app, a verified business, an approved
 * template for every message, and a paid BSP. None of that is realistic for a
 * single-location owner who just wants to ask ten customers for a review.
 *
 * Click-to-chat (`wa.me`) needs none of it: the link opens a chat with the
 * message pre-typed, and the owner presses send from their own WhatsApp. It is
 * a documented, public WhatsApp feature — no keys, no approvals, no rate
 * limits beyond ordinary human sending.
 *
 * The tradeoff is honest and worth stating in the UI: sending is manual, one
 * chat at a time. Nothing here can (or pretends to) send on the user's behalf.
 */

/** Default country calling code for a workspace region, for local-format numbers. */
const REGION_DIAL_CODE: Record<Region, string> = { US: "1", CA: "1" };

export interface WhatsAppNumber {
  /** Digits only, country code included — the form wa.me expects. */
  digits: string;
  /** Display form, e.g. "+1 415 555 0123". */
  display: string;
}

/**
 * Normalize a stored phone number to WhatsApp's digits-only international form.
 *
 * Returns null when the number can't be resolved to something dialable, so the
 * caller can show the customer as ineligible instead of opening a dead chat.
 */
export function toWhatsAppNumber(
  value: string | undefined,
  region: Region = "US",
): WhatsAppNumber | null {
  const canonical = canonicalPhone(value);
  if (!canonical) return null;

  let digits = canonical.replace(/\D/g, "");
  if (!canonical.startsWith("+")) {
    const dial = REGION_DIAL_CODE[region] ?? "1";
    // A bare NANP number (10 digits) is missing its country code; an 11-digit
    // number starting with the dial code already has one.
    if (digits.length === 10) digits = `${dial}${digits}`;
    else if (digits.length === 11 && digits.startsWith(dial)) {
      /* already prefixed */
    }
  }

  // E.164 allows 8–15 digits. Anything outside that is an extension, a partial
  // record, or junk — not something to open a chat with.
  if (digits.length < 8 || digits.length > 15) return null;
  if (digits.startsWith("0")) return null;

  return { digits, display: formatDisplay(digits) };
}

function formatDisplay(digits: string): string {
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  return `+${digits}`;
}

/**
 * Click-to-chat URL with the message pre-filled.
 *
 * `wa.me` is the official short link: it hands off to the WhatsApp desktop app
 * when installed and falls back to WhatsApp Web in the browser, so one URL
 * covers both without sniffing the platform.
 */
export function whatsAppChatUrl(digits: string, message: string): string {
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/**
 * Force the WhatsApp Web composer specifically. Useful when the desktop app
 * isn't installed and `wa.me` would otherwise land on an install prompt.
 */
export function whatsAppWebUrl(digits: string, message: string): string {
  return `https://web.whatsapp.com/send?phone=${digits}&text=${encodeURIComponent(message)}`;
}
