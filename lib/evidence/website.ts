import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { WebsiteEvidenceSnapshot, WebsitePageEvidence } from "@/lib/data/types";

const MAX_PAGES = 5;
const MAX_BYTES = 1_500_000;
const FETCH_TIMEOUT_MS = 10_000;

export async function collectWebsiteEvidence(
  requestedUrl: string | undefined,
  observedAt: string,
): Promise<WebsiteEvidenceSnapshot> {
  const empty: WebsiteEvidenceSnapshot = {
    status: requestedUrl ? "error" : "not_connected",
    observedAt,
    requestedUrl,
    pages: [],
    facts: { businessNames: [], phones: [], emails: [], addresses: [], services: [], socialProfiles: [] },
  };
  if (!requestedUrl) return empty;
  try {
    const start = await assertPublicHttpUrl(requestedUrl);
    const pages: WebsitePageEvidence[] = [];
    const facts = empty.facts;
    const queue = [start.toString()];
    const seen = new Set<string>();
    let finalUrl: string | undefined;

    while (queue.length && pages.length < MAX_PAGES) {
      const candidate = queue.shift();
      if (!candidate || seen.has(candidate)) continue;
      seen.add(candidate);
      const response = await fetchWebsiteHtml(candidate);
      finalUrl ??= response.url;
      const parsed = parseWebsiteHtml(response.html, response.url);
      pages.push(parsed.page);
      mergeFacts(facts, parsed.facts);
      for (const link of parsed.sameOriginLinks) {
        if (queue.length + pages.length >= MAX_PAGES * 3) break;
        if (!seen.has(link)) queue.push(link);
      }
    }
    return { status: "synced", observedAt, requestedUrl, finalUrl, pages, facts };
  } catch (error) {
    return { ...empty, error: error instanceof Error ? error.message : "Website evidence fetch failed." };
  }
}

export function parseWebsiteHtml(html: string, pageUrl: string): {
  page: WebsitePageEvidence;
  facts: WebsiteEvidenceSnapshot["facts"];
  sameOriginLinks: string[];
} {
  const base = new URL(pageUrl);
  const withoutNoise = html
    .replace(/<script\b(?![^>]*type=["']application\/ld\+json["'])[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ");
  const title = firstCapture(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const description = firstCapture(html, /<meta\b(?=[^>]*name=["']description["'])[^>]*content=["']([^"']*)["'][^>]*>/i)
    ?? firstCapture(html, /<meta\b(?=[^>]*property=["']og:description["'])[^>]*content=["']([^"']*)["'][^>]*>/i);
  const headings = [...withoutNoise.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
    .map((match) => cleanText(match[1] ?? ""))
    .filter(Boolean)
    .slice(0, 40);
  const text = cleanText(withoutNoise).slice(0, 12_000);
  const images = [...html.matchAll(/<img\b[^>]*>/gi)].flatMap((match) => {
    const tag = match[0];
    const src = attribute(tag, "src");
    if (!src) return [];
    try {
      return [{ url: new URL(src, base).toString(), alt: attribute(tag, "alt") }];
    } catch {
      return [];
    }
  }).slice(0, 50);
  const links = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)]
    .flatMap((match) => {
      try { return [new URL(match[1] ?? "", base)]; } catch { return []; }
    });
  const socialProfiles = unique(links
    .filter((url) => /(^|\.)(instagram\.com|facebook\.com|linkedin\.com|youtube\.com|tiktok\.com)$/i.test(url.hostname))
    .map((url) => url.toString()));
  const sameOriginLinks = unique(links
    .filter((url) => url.origin === base.origin && /^https?:$/.test(url.protocol))
    .filter((url) => /service|treatment|product|about|contact|location|team/i.test(url.pathname))
    .map((url) => { url.hash = ""; return url.toString(); }));
  const jsonLd = parseJsonLd(html);
  const businessNames = unique([
    ...jsonLd.flatMap((value) => stringsAtKeys(value, new Set(["name", "legalName"]))),
    ...(title ? [title.split(/[|—–-]/)[0]?.trim() ?? title] : []),
  ].filter(Boolean));
  const phones = unique([
    ...jsonLd.flatMap((value) => stringsAtKeys(value, new Set(["telephone"]))),
    ...[...text.matchAll(/(?:\+?\d[\d\s().-]{7,}\d)/g)].map((match) => match[0]),
  ].map(normalizePhone).filter((value) => value.length >= 7));
  const emails = unique([...text.matchAll(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g)].map((match) => match[0].toLowerCase()));
  const addresses = unique(jsonLd.flatMap((value) => addressesFromJsonLd(value)));
  const services = unique([
    ...jsonLd.flatMap((value) => stringsAtKeys(value, new Set(["makesOffer", "serviceType", "itemOffered"]))),
    ...headings.filter((heading) => /service|treatment|therapy|repair|consult|product|care|rehab/i.test(heading)),
  ]).slice(0, 80);

  return {
    page: { url: pageUrl, title, description, headings, textSample: text, images },
    facts: { businessNames, phones, emails, addresses, services, socialProfiles },
    sameOriginLinks,
  };
}

export function isBlockedIp(address: string): boolean {
  const value = address.toLowerCase();
  if (value === "::1" || value === "::" || value.startsWith("fe80:") || value.startsWith("fc") || value.startsWith("fd")) return true;
  if (value.startsWith("::ffff:")) return isBlockedIp(value.slice(7));
  if (!isIP(value)) return true;
  if (value.includes(":")) return value.startsWith("ff") || value === "0:0:0:0:0:0:0:1";
  const octets = value.split(".").map(Number);
  const a = octets[0] ?? 0;
  const b = octets[1] ?? 0;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    a >= 224 || (a === 100 && b >= 64 && b <= 127);
}

async function assertPublicHttpUrl(value: string): Promise<URL> {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Website URL must use http or https.");
  if (url.username || url.password) throw new Error("Website URL cannot contain embedded credentials.");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("Website URL uses an unsupported port.");
  if (!url.hostname || url.hostname === "localhost" || isIP(url.hostname) && isBlockedIp(url.hostname)) {
    throw new Error("Website URL is not a public internet destination.");
  }
  const addresses = await Promise.race([
    lookup(url.hostname, { all: true, verbatim: true }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Website DNS lookup timed out.")), 4_000)),
  ]);
  if (!addresses.length || addresses.some((entry) => isBlockedIp(entry.address))) {
    throw new Error("Website DNS resolves to a private or unsafe network address.");
  }
  return url;
}

async function fetchWebsiteHtml(value: string): Promise<{ url: string; html: string }> {
  let current = await assertPublicHttpUrl(value);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetch(current, {
      redirect: "manual",
      headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "FoundlyEvidenceBot/1.0" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const destination = response.headers.get("location");
      if (!destination) throw new Error("Website returned a redirect without a destination.");
      current = await assertPublicHttpUrl(new URL(destination, current).toString());
      continue;
    }
    if (!response.ok) throw new Error(`Website returned HTTP ${response.status}.`);
    if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("text/html")) {
      throw new Error("Website did not return HTML.");
    }
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES) throw new Error("Website page is too large to analyze safely.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) throw new Error("Website page is too large to analyze safely.");
    return { url: current.toString(), html: new TextDecoder().decode(bytes) };
  }
  throw new Error("Website redirected too many times.");
}

function parseJsonLd(html: string): unknown[] {
  return [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .flatMap((match) => {
      try { return [JSON.parse(match[1] ?? "null") as unknown]; } catch { return []; }
    });
}

function stringsAtKeys(value: unknown, keys: Set<string>): string[] {
  if (Array.isArray(value)) return value.flatMap((entry) => stringsAtKeys(entry, keys));
  if (!value || typeof value !== "object") return [];
  const results: string[] = [];
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (keys.has(key)) {
      if (typeof entry === "string") results.push(entry);
      if (entry && typeof entry === "object" && "name" in entry && typeof (entry as { name?: unknown }).name === "string") {
        results.push((entry as { name: string }).name);
      }
    }
    results.push(...stringsAtKeys(entry, keys));
  }
  return results;
}

function addressesFromJsonLd(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(addressesFromJsonLd);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const own = record.address && typeof record.address === "object"
    ? [Object.values(record.address as Record<string, unknown>).filter((entry): entry is string => typeof entry === "string").join(", ")]
    : [];
  return [...own, ...Object.values(record).flatMap(addressesFromJsonLd)].filter(Boolean);
}

function mergeFacts(target: WebsiteEvidenceSnapshot["facts"], source: WebsiteEvidenceSnapshot["facts"]): void {
  for (const key of Object.keys(target) as Array<keyof WebsiteEvidenceSnapshot["facts"]>) {
    target[key] = unique([...target[key], ...source[key]]);
  }
}

function attribute(tag: string, name: string): string | undefined {
  return firstCapture(tag, new RegExp(`\\b${name}=["']([^"']*)["']`, "i"));
}
function firstCapture(value: string, pattern: RegExp): string | undefined {
  const captured = pattern.exec(value)?.[1];
  const cleaned = captured ? cleanText(captured) : "";
  return cleaned || undefined;
}
function cleanText(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/\s+/g, " ").trim();
}
function normalizePhone(value: string): string { return value.replace(/[^\d+]/g, ""); }
function unique(values: string[]): string[] { return [...new Set(values.map((value) => value.trim()).filter(Boolean))]; }
