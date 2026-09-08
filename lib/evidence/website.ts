import "server-only";
import { lookup } from "node:dns/promises";
import { lookup as lookupCb } from "node:dns";
import { isIP } from "node:net";
import http from "node:http";
import https from "node:https";
import type { WebsiteEvidenceSnapshot, WebsitePageEvidence } from "@/lib/data/types";

const MAX_PAGES = 5;
const MAX_BYTES = 1_500_000;
const FETCH_TIMEOUT_MS = 10_000;

/** Most services kept from a crawl — beyond this the review picker shows none of them anyway. */
export const MAX_SERVICES = 12;

/** Paths where a business lists what it sells. */
const SERVICE_PATH = /service|treatment|procedure|menu|what-we-do|what_we_do|offer|solution|pricing|specialt|program|class/i;

/**
 * Link text and headings that name a section, not a service. A crawl that
 * returned "Our Services" as a service is the exact failure this list exists
 * to prevent.
 */
const GENERIC_LABELS = new Set([
  "services", "our services", "all services", "service", "view services", "see all services", "more services",
  "treatments", "our treatments", "menu", "our menu", "view menu", "full menu",
  "what we do", "what we offer", "our work", "our expertise", "solutions", "specialties", "specialities",
  "home", "about", "about us", "our story", "who we are", "team", "our team", "meet the team", "staff",
  "contact", "contact us", "get in touch", "location", "locations", "hours", "directions", "find us",
  "reviews", "testimonials", "gallery", "portfolio", "blog", "news", "faq", "faqs", "resources", "careers", "jobs",
  "pricing", "prices", "rates", "packages", "plans", "book", "book now", "book online", "schedule", "appointments",
  "request a quote", "get a quote", "free quote", "free estimate", "call now", "call us", "learn more", "read more",
  "why choose us", "why us", "our process", "how it works", "privacy policy", "terms", "terms of service", "sitemap",
  "login", "log in", "sign in", "sign up", "my account", "cart", "shop", "products", "skip to content",
]);

/** Marketing verbs and pronouns that mark a sentence rather than a label. */
const SENTENCE_MARKERS = /\b(we|our|you|your|us|the best|welcome|call|today|now|click|learn|discover|get|book|free)\b|[.!?:]$|\?|!/i;

/** True when a string reads like a service label rather than a heading or slogan. */
export function looksLikeServiceLabel(raw: string): boolean {
  const value = raw.trim().replace(/\s+/g, " ");
  if (value.length < 3 || value.length > 60) return false;
  const words = value.split(" ");
  if (words.length > 6) return false;
  if (GENERIC_LABELS.has(value.toLowerCase())) return false;
  if (SENTENCE_MARKERS.test(value)) return false;
  if (/^\d+$/.test(value)) return false;
  if (!/[a-z]/i.test(value)) return false;
  return true;
}

/** Title Case for shouting labels; leave mixed-case labels alone. */
function tidyLabel(raw: string): string {
  const value = raw.trim().replace(/\s+/g, " ").replace(/\s*[»›>]+\s*$/, "");
  if (value === value.toUpperCase() && value.length > 3) {
    return value
      .toLowerCase()
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }
  return value;
}

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
      let response: { url: string; html: string };
      try {
        response = await fetchWebsiteHtml(candidate);
      } catch (error) {
        // The entry page must load; a broken inner link must not sink the
        // whole crawl — skip it and keep the facts already gathered.
        if (pages.length === 0) throw error;
        continue;
      }
      finalUrl ??= response.url;
      const parsed = parseWebsiteHtml(response.html, response.url);
      pages.push(parsed.page);
      mergeFacts(facts, parsed.facts);
      // Service-ish pages first: they are where the service list actually
      // lives, and the page budget is small.
      const ranked = [...parsed.sameOriginLinks].sort(
        (a, b) => Number(SERVICE_PATH.test(new URL(b).pathname)) - Number(SERVICE_PATH.test(new URL(a).pathname)),
      );
      for (const link of ranked) {
        if (queue.length + pages.length >= MAX_PAGES * 3) break;
        if (!seen.has(link)) queue.push(link);
      }
    }
    facts.services = facts.services.slice(0, MAX_SERVICES);
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
  // Anchors with their visible text — the text is what names a service in a
  // nav or a service grid ("Deep Cleaning", "Root Canal"); the href tells us
  // whether it points at a service page.
  const anchors = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .flatMap((match) => {
      try {
        return [{ url: new URL(match[1] ?? "", base), text: cleanText(match[2] ?? "") }];
      } catch {
        return [];
      }
    });
  const links = anchors.map((anchor) => anchor.url);
  const socialProfiles = unique(links
    .filter((url) => /(^|\.)(instagram\.com|facebook\.com|linkedin\.com|youtube\.com|tiktok\.com)$/i.test(url.hostname))
    .map((url) => url.toString()));
  const sameOriginLinks = unique(links
    .filter((url) => url.origin === base.origin && /^https?:$/.test(url.protocol))
    .filter((url) => SERVICE_PATH.test(url.pathname) || /product|about|contact|location|team/i.test(url.pathname))
    .map((url) => { url.hash = ""; return url.toString(); }));
  const jsonLd = parseJsonLd(html);
  const onServicePage = SERVICE_PATH.test(base.pathname);
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
  /*
   * Service candidates, most reliable source first:
   *  1. structured data — offers, offer catalogs, Service entities;
   *  2. links that point at a service page and read like a label
   *     ("Deep Cleaning", not "Learn more");
   *  3. h2/h3 headings ON a service page, which is where a services grid lists
   *     one service per heading.
   * A section title such as "Our Services" is filtered out at every step.
   */
  const structured = jsonLd.flatMap((value) => [
    ...stringsAtKeys(value, new Set(["makesOffer", "serviceType", "itemOffered"])),
    ...serviceNamesFromJsonLd(value),
  ]);
  const linkLabels = anchors
    .filter((anchor) => anchor.url.origin === base.origin && SERVICE_PATH.test(anchor.url.pathname))
    // A link to the services index itself ("/services") is a section, not a
    // service; a deeper path ("/services/deep-cleaning") names one.
    .filter((anchor) => anchor.url.pathname.replace(/\/+$/, "").split("/").filter(Boolean).length >= 2 || onServicePage)
    .map((anchor) => anchor.text);
  const servicePageHeadings = onServicePage
    ? [...withoutNoise.matchAll(/<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/gi)]
        .map((match) => cleanText(match[1] ?? ""))
    : [];
  const services = unique(
    [...structured, ...linkLabels, ...servicePageHeadings]
      .map(tidyLabel)
      .filter(looksLikeServiceLabel),
  ).slice(0, MAX_SERVICES * 2);

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
  const c = octets[2] ?? 0;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    a >= 224 || (a === 100 && b >= 64 && b <= 127) ||
    // V6: additional non-public ranges the original blocklist missed.
    (a === 192 && b === 0 && c === 0) ||       // 192.0.0.0/24 (IETF protocol assignments)
    (a === 198 && (b === 18 || b === 19));      // 198.18.0.0/15 (benchmarking)
}

/**
 * Connection-time DNS guard (V6). undici resolves the hostname again at connect,
 * independent of the pre-flight validation in assertPublicHttpUrl — a DNS-
 * rebinding attacker can answer "public" for the first lookup and "internal" for
 * the second. Enforcing the private-range blocklist inside the connector's own
 * lookup makes the check atomic with the connection: the address that is
 * validated is the exact address that gets dialed.
 */
interface LookupEntry {
  address: string;
  family: number;
}

type GuardedLookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupEntry[],
  family?: number,
) => void;

function guardedLookup(
  hostname: string,
  options: unknown,
  callback: GuardedLookupCallback,
): void {
  /*
   * Answer in the SHAPE the caller asked for.
   *
   * Node's connector sets `autoSelectFamily` by default from Node 20, and that
   * path calls `lookup` with `{ all: true }` and then indexes the result as an
   * array. Replying with a single address string made it read `undefined.address`
   * and throw "Invalid IP address: undefined" — so every website evidence fetch
   * failed on any modern Node, and the failure surfaced as an unexplained error
   * string on the profile snapshot rather than as a missing website.
   */
  const wantsAll = Boolean((options as { all?: boolean } | null | undefined)?.all);
  lookupCb(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err, "", 0);
    const list = Array.isArray(addresses) ? addresses : [addresses];
    // Every candidate is filtered, not just the first: with autoSelectFamily the
    // connector may try any address in the list, so a blocked one left in the
    // array would still be dialed.
    const safe = list
      .filter((entry) => !isBlockedIp(entry.address))
      .map((entry) => ({ address: entry.address, family: entry.family }));
    const first = safe[0];
    if (!first) {
      return callback(
        Object.assign(new Error("Resolved to a private or unsafe network address."), { code: "EAI_BLOCKED" }),
        "",
        0,
      );
    }
    if (wantsAll) return callback(null, safe);
    callback(null, first.address, first.family);
  });
}

interface RawResponse {
  status: number;
  location?: string;
  contentType: string;
  body: Buffer;
}

/**
 * Single GET via node:http(s) with the connect-time `lookup` guard (V6). Node's
 * global fetch (undici) cannot be given a DNS-pinning lookup, so the crawler
 * uses the core client here. Redirects are surfaced to the caller (never
 * auto-followed) so each hop is re-validated. Body is capped mid-stream.
 */
function requestOnce(target: URL): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const client = target.protocol === "https:" ? https : http;
    const req = client.request(
      target,
      {
        method: "GET",
        lookup: guardedLookup,
        headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "FoundlyEvidenceBot/1.0" },
        timeout: FETCH_TIMEOUT_MS,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = typeof res.headers.location === "string" ? res.headers.location : undefined;
        if ([301, 302, 303, 307, 308].includes(status)) {
          res.resume(); // drain; caller re-validates and re-requests
          resolve({ status, location, contentType: "", body: Buffer.alloc(0) });
          return;
        }
        const declared = Number(res.headers["content-length"] ?? 0);
        if (Number.isFinite(declared) && declared > MAX_BYTES) {
          req.destroy();
          reject(new Error("Website page is too large to analyze safely."));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            req.destroy();
            reject(new Error("Website page is too large to analyze safely."));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () =>
          resolve({
            status,
            contentType: String(res.headers["content-type"] ?? ""),
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    req.on("timeout", () => req.destroy(new Error("Website request timed out.")));
    req.on("error", reject);
    req.end();
  });
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
    const response = await requestOnce(current);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (!response.location) throw new Error("Website returned a redirect without a destination.");
      // Re-validate every hop; the connect-time guard re-checks it again on dial.
      current = await assertPublicHttpUrl(new URL(response.location, current).toString());
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Website returned HTTP ${response.status}.`);
    }
    if (!response.contentType.toLowerCase().includes("text/html")) {
      throw new Error("Website did not return HTML.");
    }
    if (response.body.byteLength > MAX_BYTES) {
      throw new Error("Website page is too large to analyze safely.");
    }
    return { url: current.toString(), html: new TextDecoder().decode(response.body) };
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

/**
 * Names of `Service` entities and `hasOfferCatalog` items — the two schema.org
 * shapes `stringsAtKeys` cannot reach because the name sits on the entity, not
 * under an offer key.
 */
function serviceNamesFromJsonLd(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(serviceNamesFromJsonLd);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const results: string[] = [];
  const type = record["@type"];
  const types = Array.isArray(type) ? type : [type];
  if (types.some((entry) => typeof entry === "string" && /^(Service|Product|MenuItem|Offer)$/i.test(entry))) {
    if (typeof record.name === "string") results.push(record.name);
  }
  for (const entry of Object.values(record)) {
    if (entry && typeof entry === "object") results.push(...serviceNamesFromJsonLd(entry));
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
