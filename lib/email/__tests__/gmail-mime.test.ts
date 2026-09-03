import { describe, expect, it } from "vitest";
import {
  base64UrlEncode,
  buildGmailMessage,
  buildGmailRaw,
  encodeHeaderValue,
} from "@/lib/email/gmail-mime";

/**
 * The Gmail API takes the whole RFC 2822 message as one base64url blob, so a
 * malformed header or a stray "+" in the encoding fails silently at Google's
 * end. These pin the wire format.
 */

const BASE = {
  from: "Harbourview Dental <reviews@harbourview.ca>",
  to: "customer@example.com",
  subject: "How was your visit?",
  html: "<p>Hi there</p>",
  text: "Hi there",
};

function headerBlock(message: string): string {
  return message.split("\r\n\r\n")[0]!;
}

describe("buildGmailMessage", () => {
  it("writes From/To/Subject/MIME headers with CRLF line endings", () => {
    const msg = buildGmailMessage(BASE);
    const head = headerBlock(msg);
    expect(head).toContain("From: Harbourview Dental <reviews@harbourview.ca>\r\n");
    expect(head).toContain("To: customer@example.com\r\n");
    expect(head).toContain("Subject: How was your visit?\r\n");
    expect(head).toContain("MIME-Version: 1.0");
    expect(head).toMatch(/^Date: .+ GMT$/m);
    // No bare LF anywhere — Gmail rejects mixed line endings.
    expect(msg.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("wraps text + html as multipart/alternative with text first", () => {
    const msg = buildGmailMessage(BASE);
    const boundary = /boundary="([^"]+)"/.exec(msg)?.[1];
    expect(boundary).toBeTruthy();
    expect(headerBlock(msg)).toContain("Content-Type: multipart/alternative;");
    const textIdx = msg.indexOf('Content-Type: text/plain; charset="UTF-8"');
    const htmlIdx = msg.indexOf('Content-Type: text/html; charset="UTF-8"');
    expect(textIdx).toBeGreaterThan(0);
    expect(htmlIdx).toBeGreaterThan(textIdx);
    expect(msg.endsWith(`--${boundary}--\r\n`)).toBe(true);
    // Bodies are base64 so long HTML lines never exceed SMTP limits.
    expect(msg).toContain(Buffer.from(BASE.html, "utf8").toString("base64"));
    expect(msg).toContain(Buffer.from(BASE.text, "utf8").toString("base64"));
  });

  it("sends a single html part when there is no text alternative", () => {
    const msg = buildGmailMessage({ ...BASE, text: undefined });
    expect(msg).not.toContain("multipart/alternative");
    expect(msg).not.toContain("boundary=");
    expect(headerBlock(msg)).toContain('Content-Type: text/html; charset="UTF-8"');
  });

  it("carries Reply-To and the RFC 8058 List-Unsubscribe pair", () => {
    const msg = buildGmailMessage({
      ...BASE,
      replyTo: "hello@harbourview.ca",
      headers: {
        "List-Unsubscribe": "<https://app.example/u/abc>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    const head = headerBlock(msg);
    expect(head).toContain("Reply-To: hello@harbourview.ca");
    expect(head).toContain("List-Unsubscribe: <https://app.example/u/abc>");
    expect(head).toContain("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
  });

  it("RFC 2047-encodes a non-ASCII subject and leaves ASCII alone", () => {
    expect(encodeHeaderValue("Plain subject")).toBe("Plain subject");
    const encoded = encodeHeaderValue("Merci — à bientôt");
    expect(encoded).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/);
    expect(Buffer.from(encoded.slice(10, -2), "base64").toString("utf8")).toBe("Merci — à bientôt");
  });

  it("strips CR/LF from header values so a caller can't inject headers", () => {
    const msg = buildGmailMessage({
      ...BASE,
      to: "victim@example.com\r\nBcc: everyone@example.com",
      subject: "Hi\nX-Injected: yes",
    });
    const head = headerBlock(msg);
    // The injected text survives only as inert content inside the original
    // header's value — never as a header line of its own.
    expect(head).not.toMatch(/^Bcc:/m);
    expect(head).not.toMatch(/^X-Injected:/m);
    expect(head).toContain("To: victim@example.com Bcc: everyone@example.com\r\n");
    expect(head).toContain("Subject: Hi X-Injected: yes\r\n");
  });
});

describe("base64UrlEncode / buildGmailRaw", () => {
  it("uses the URL-safe alphabet with no padding", () => {
    // 0xfb 0xff → "+/8=" in standard base64.
    const raw = base64UrlEncode("ûÿ");
    expect(raw).not.toMatch(/[+/=]/);
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("round-trips: decoding `raw` yields the exact message", () => {
    const raw = buildGmailRaw(BASE);
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    expect(decoded).toContain("From: Harbourview Dental <reviews@harbourview.ca>\r\n");
    expect(decoded).toContain("Subject: How was your visit?\r\n");
  });
});
