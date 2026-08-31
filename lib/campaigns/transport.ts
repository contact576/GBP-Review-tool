import "server-only";
import { emailEnabled, sendEmail } from "@/lib/email";
import { sendSms, smsEnabled } from "@/lib/sms/twilio";
import type { CampaignTransport } from "./send";

/**
 * The real rails: Resend for email, Twilio for SMS — the same adapters the
 * review-request path already uses. Both are ready-but-inactive, so with no
 * keys `emailEnabled()`/`smsEnabled()` return false and the pipeline records an
 * honest "not connected" instead of pretending to send.
 */
export const liveTransport: CampaignTransport = {
  emailEnabled,
  smsEnabled,
  sendEmail,
  sendSms,
};
