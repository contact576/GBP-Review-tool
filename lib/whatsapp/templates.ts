/**
 * WhatsApp message templates.
 *
 * Plain text with `{{merge}}` tags, because the message is typed into WhatsApp
 * itself — no HTML, no markup beyond WhatsApp's own *bold* / _italic_. Kept
 * short: a review ask that runs past a couple of lines gets skimmed.
 */

export const WHATSAPP_MERGE_TAGS = [
  { tag: "{{name}}", label: "Customer first name" },
  { tag: "{{business}}", label: "Your business name" },
  { tag: "{{link}}", label: "Their review link" },
] as const;

export interface WhatsAppTemplate {
  key: string;
  label: string;
  body: string;
}

export const WHATSAPP_TEMPLATES: WhatsAppTemplate[] = [
  {
    key: "warm",
    label: "Warm and short",
    body:
      "Hi {{name}}, thanks for choosing {{business}}! " +
      "If you have 30 seconds, would you mind leaving us a quick review? " +
      "It genuinely helps a small business like ours.\n\n{{link}}",
  },
  {
    key: "direct",
    label: "Direct",
    body:
      "Hi {{name}} — it's {{business}}. Could you leave us a Google review? " +
      "It takes about 30 seconds:\n\n{{link}}\n\nThank you!",
  },
  {
    key: "followup",
    label: "Gentle follow-up",
    body:
      "Hi {{name}}, just a quick nudge from {{business}} — no pressure at all. " +
      "If you were happy with how things went, a short review would mean a lot:\n\n{{link}}",
  },
];

/** First name only — full names read as a mail merge, which is the thing to avoid. */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

/** Substitute merge tags. Unknown tags are left alone rather than blanked. */
export function renderWhatsAppMessage(
  template: string,
  values: { name: string; business: string; link: string },
): string {
  return template
    .replace(/\{\{\s*name\s*\}\}/gi, firstName(values.name))
    .replace(/\{\{\s*business\s*\}\}/gi, values.business)
    .replace(/\{\{\s*link\s*\}\}/gi, values.link);
}
