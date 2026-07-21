/** Stable comparison form for consent/suppression checks. */
export function canonicalPhone(value: string | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

/** Twilio requires SMS recipients in E.164 form. */
export function isE164(value: string | undefined): value is string {
  return /^\+[1-9]\d{7,14}$/.test(canonicalPhone(value));
}
