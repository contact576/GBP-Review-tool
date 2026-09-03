import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { canonicalPhone, isE164 } from "./phone";

const API = "https://api.twilio.com/2010-04-01";

export function smsEnabled(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      (process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_FROM_NUMBER),
  );
}

/**
 * Exactly the env vars `smsEnabled()` checks, so an operator-facing "not
 * configured" state can name what is missing instead of a vague "pending".
 * The sender is one-of, so it is reported as a single combined entry.
 */
export const SMS_SENDER_ENV = "TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER";

export function smsMissingEnvVars(): string[] {
  const missing: string[] = [];
  if (!process.env.TWILIO_ACCOUNT_SID) missing.push("TWILIO_ACCOUNT_SID");
  if (!process.env.TWILIO_AUTH_TOKEN) missing.push("TWILIO_AUTH_TOKEN");
  if (!process.env.TWILIO_MESSAGING_SERVICE_SID && !process.env.TWILIO_FROM_NUMBER) {
    missing.push(SMS_SENDER_ENV);
  }
  return missing;
}

/**
 * Owner-readable description of what outbound texts send from, without
 * disclosing the full identifier: "your Messaging Service (…a1b2)" or
 * "number ending 0123". Null when no sender is configured.
 */
export function smsSenderDescription(): string | null {
  const service = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();
  if (service) return `your Twilio Messaging Service (…${service.slice(-4)})`;
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  if (from) {
    const digits = from.replace(/\D/g, "");
    return digits.length >= 4 ? `number ending ${digits.slice(-4)}` : "the configured Twilio number";
  }
  return null;
}

export async function sendSms(input: {
  to: string;
  body: string;
  statusCallback: string;
}): Promise<
  | { ok: true; sid: string; status: string }
  | { ok: false; error: string }
> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const serviceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const from = process.env.TWILIO_FROM_NUMBER;
  const to = canonicalPhone(input.to);
  if (!accountSid || !authToken || (!serviceSid && !from)) {
    return { ok: false, error: "not_configured" };
  }
  if (!isE164(to)) return { ok: false, error: "Phone number must use E.164 format." };
  const form = new URLSearchParams({
    To: to,
    Body: input.body.slice(0, 1_600),
    StatusCallback: input.statusCallback,
  });
  if (serviceSid) form.set("MessagingServiceSid", serviceSid);
  else if (from) form.set("From", from);

  try {
    const response = await fetch(`${API}/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
      cache: "no-store",
    });
    const data = (await response.json().catch(() => ({}))) as {
      sid?: string;
      status?: string;
      message?: string;
    };
    if (!response.ok || !data.sid) {
      return { ok: false, error: data.message ?? `Twilio ${response.status}` };
    }
    return { ok: true, sid: data.sid, status: data.status ?? "accepted" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Twilio network error" };
  }
}

/** Validate Twilio's HMAC-SHA1 signature over the exact URL and POST fields. */
export function validateTwilioSignature(
  url: string,
  params: URLSearchParams,
  signature: string | null,
): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token || !signature) return false;
  const entries = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const payload = entries.reduce((value, [key, item]) => `${value}${key}${item}`, url);
  const expected = createHmac("sha1", token).update(payload).digest("base64");
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  return left.length === right.length && timingSafeEqual(left, right);
}
