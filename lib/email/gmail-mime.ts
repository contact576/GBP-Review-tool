/**
 * RFC 2822 / MIME message builder for the Gmail API.
 *
 * `users.messages.send` takes the *whole* message — headers and body — as one
 * base64url string, so this module does what Resend and nodemailer do for us
 * elsewhere: assemble headers, encode non-ASCII subjects (RFC 2047), and wrap
 * text + HTML in a multipart/alternative envelope. Pure and dependency-free so
 * it is unit-testable without a mailbox.
 */

export interface GmailMessageInput {
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  /** Extra headers — the RFC 8058 List-Unsubscribe pair goes here. */
  headers?: Record<string, string>;
}

const CRLF = "\r\n";

/** Header-safe: strip CR/LF so a caller-supplied value can never inject headers. */
function clean(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/** RFC 2047 encoded-word for any header value that isn't plain 7-bit ASCII. */
export function encodeHeaderValue(value: string): string {
  const v = clean(value);
  if (/^[\x20-\x7e]*$/.test(v)) return v;
  return `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=`;
}

/** Base64 body split into 76-column lines, as RFC 2045 requires. */
function base64Body(value: string): string {
  const b64 = Buffer.from(value, "utf8").toString("base64");
  return b64.replace(/(.{76})/g, `$1${CRLF}`).replace(/\r\n$/, "");
}

/** Standard base64url (no padding) — what the Gmail API's `raw` field expects. */
export function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Deterministic-enough boundary; callers never see it. */
function boundary(): string {
  return `foundly_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

/** The raw RFC 2822 message (CRLF line endings), before any encoding. */
export function buildGmailMessage(input: GmailMessageInput): string {
  const headers: Array<[string, string]> = [
    ["From", clean(input.from)],
    ["To", clean(input.to)],
    ["Subject", encodeHeaderValue(input.subject)],
    ["Date", new Date().toUTCString()],
    ["MIME-Version", "1.0"],
  ];
  if (input.replyTo) headers.push(["Reply-To", clean(input.replyTo)]);
  for (const [name, value] of Object.entries(input.headers ?? {})) {
    headers.push([clean(name), clean(value)]);
  }

  const htmlPart =
    `Content-Type: text/html; charset="UTF-8"${CRLF}` +
    `Content-Transfer-Encoding: base64${CRLF}${CRLF}` +
    base64Body(input.html);

  if (!input.text) {
    // Single-part HTML: no boundary needed.
    const head = headers.map(([k, v]) => `${k}: ${v}`).join(CRLF);
    return `${head}${CRLF}${htmlPart}${CRLF}`;
  }

  const b = boundary();
  headers.push(["Content-Type", `multipart/alternative; boundary="${b}"`]);
  const head = headers.map(([k, v]) => `${k}: ${v}`).join(CRLF);
  const textPart =
    `Content-Type: text/plain; charset="UTF-8"${CRLF}` +
    `Content-Transfer-Encoding: base64${CRLF}${CRLF}` +
    base64Body(input.text);

  // Plain text first, HTML last: mail clients render the last part they
  // support, so this ordering shows HTML where possible and text otherwise.
  return [
    head,
    "",
    `--${b}`,
    textPart,
    `--${b}`,
    htmlPart,
    `--${b}--`,
    "",
  ].join(CRLF);
}

/** The `raw` value for `POST users/me/messages/send`. */
export function buildGmailRaw(input: GmailMessageInput): string {
  return base64UrlEncode(buildGmailMessage(input));
}
