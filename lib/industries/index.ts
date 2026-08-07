/**
 * Industry catalog public API — the single source of truth for
 * industry-specific content across onboarding, staff capture, the customer
 * review page, AI prompts, and dashboards.
 */

import type { Industry, IndustryGroup } from "./types";
import { INDUSTRY_CATALOG, PROFESSIONAL_SERVICES_INDUSTRY } from "./catalog";

export type { Industry, IndustryGroup } from "./types";

/** All 36 catalog industries, in display/match order. */
export const INDUSTRIES: readonly Industry[] = INDUSTRY_CATALOG;

/** Group headers for pickers, in display order. */
export const INDUSTRY_GROUPS: { key: IndustryGroup; label: string }[] = [
  { key: "dining", label: "Food & Dining" },
  { key: "beauty", label: "Beauty & Wellness" },
  { key: "health", label: "Health & Medical" },
  { key: "trades", label: "Home & Trades" },
  { key: "realestate", label: "Real Estate & Lending" },
  { key: "professional", label: "Professional Services" },
  { key: "auto", label: "Automotive" },
  { key: "education", label: "Education & Childcare" },
  { key: "fitness", label: "Fitness" },
  { key: "hospitality", label: "Hospitality & Events" },
  { key: "retail", label: "Retail" },
  { key: "other", label: "Other" },
];

/** "dog_grooming" -> "Dog Grooming". */
function humanizeKey(key: string): string {
  const words = key
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) return "Business";
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Look up an industry by key. Unknown keys never crash: they return a
 * professional_services-based fallback whose key is preserved and whose
 * label echoes the unknown key (e.g. "dog_grooming" -> "Dog Grooming").
 */
export function getIndustry(key: string): Industry {
  const match = INDUSTRIES.find((industry) => industry.key === key);
  if (match) return match;
  return {
    ...PROFESSIONAL_SERVICES_INDUSTRY,
    key,
    label: humanizeKey(key),
  };
}

/**
 * Case-insensitive substring match of Google place type/category text
 * against each industry's googleCategories. Earlier catalog entries win.
 */
export function industryForGoogleCategory(categoryText: string): Industry | null {
  const text = categoryText.toLowerCase();
  if (text.trim().length === 0) return null;
  for (const industry of INDUSTRIES) {
    if (industry.googleCategories.some((fragment) => text.includes(fragment))) {
      return industry;
    }
  }
  return null;
}

/** Industries bucketed by group, groups ordered per INDUSTRY_GROUPS. */
export function industriesByGroup(): Map<IndustryGroup, Industry[]> {
  const map = new Map<IndustryGroup, Industry[]>();
  for (const group of INDUSTRY_GROUPS) map.set(group.key, []);
  for (const industry of INDUSTRIES) {
    const bucket = map.get(industry.group);
    if (bucket) {
      bucket.push(industry);
    } else {
      map.set(industry.group, [industry]);
    }
  }
  for (const [key, list] of map) {
    if (list.length === 0) map.delete(key);
  }
  return map;
}

/** Old 7-value `Vertical` union -> catalog industry keys. */
export const LEGACY_VERTICAL_MAP: Record<string, string> = {
  physiotherapy: "physiotherapy",
  chiropractic: "chiropractic",
  dental: "dental",
  hvac: "hvac",
  renovation: "renovation",
  salon: "salon",
  restaurant: "restaurant",
};

/** Merge two chip lists: custom first, trimmed, case-insensitively deduped. */
function mergeUnique(custom: string[] | undefined, base: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const value of [...(custom ?? []), ...base]) {
    const trimmed = value.trim();
    if (trimmed.length === 0) continue;
    const dedupeKey = trimmed.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    merged.push(trimmed);
  }
  return merged;
}

// ── Real Google Business Profile services ───────────────────

/**
 * Structural shape of a Google Business Profile service item. Kept structural
 * (rather than importing `GbpServiceItem`) so the catalog stays independent of
 * the data layer — the fields below are the ones this module actually reads.
 */
export interface GbpServiceItemLike {
  name?: string;
  description?: string;
  categoryName?: string;
  serviceTypeId?: string;
  source?: string;
}

/** Where a customer-facing service option came from, most authoritative first. */
export type ServiceOptionSource = "google_profile" | "owner" | "catalog";

export interface ResolvedServiceOptions {
  /**
   * Deduped options in priority order: real Google Business Profile services,
   * then the owner's own list, then the static industry catalog.
   */
  services: string[];
  /** The highest-priority source that actually contributed an option. */
  source: ServiceOptionSource;
  /** Every source that contributed at least one option, in priority order. */
  sources: ServiceOptionSource[];
  /** True when at least one option came from the connected Google profile. */
  fromGoogleProfile: boolean;
}

/**
 * A structured service item stores Google's raw service type id in `name`
 * ("job_type_id:deep_cleaning"). Free-form items store a real display label,
 * which must survive untouched.
 */
function looksLikeRawGcid(name: string): boolean {
  return /[:/]/.test(name) || /^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(name);
}

/** "job_type_id:deep_cleaning" -> "Deep cleaning"; "Deep Cleaning" -> unchanged. */
export function humanizeServiceName(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return "";
  if (!looksLikeRawGcid(trimmed)) return trimmed;
  const tail = trimmed.split(/[:/]/).filter((part) => part.trim().length > 0).pop() ?? trimmed;
  const words = tail.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (words.length === 0) return trimmed;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Display labels for the real services on a synced Google profile. */
export function gbpServiceLabels(
  items: readonly GbpServiceItemLike[] | null | undefined,
): string[] {
  if (!items) return [];
  const labels: string[] = [];
  for (const item of items) {
    const raw = (item?.name ?? "").trim();
    if (raw.length === 0) continue;
    const label = humanizeServiceName(raw);
    if (label.length > 0 && label.length <= 80) labels.push(label);
  }
  return labels;
}

/**
 * The "what did you come in for?" options, preferring what the business
 * actually publishes on Google over anything we guessed for them.
 *
 * Priority: real GBP service items → owner-entered services → static catalog.
 * `gbpServiceItems` is null for every workspace until the GBP API is approved,
 * in which case this degrades exactly to today's behaviour and lights up on
 * its own the moment a snapshot exists.
 *
 * The customer review page and the review-draft API MUST both build their list
 * from this function — the API's allowlist is what stops a real GBP service
 * from being silently filtered out of the prompt.
 */
export function resolveServiceOptions(input: {
  gbpServiceItems?: readonly GbpServiceItemLike[] | null;
  ownerServices?: readonly string[] | null;
  catalogServices?: readonly string[] | null;
}): ResolvedServiceOptions {
  const tiers: { source: ServiceOptionSource; values: string[] }[] = [
    { source: "google_profile", values: gbpServiceLabels(input.gbpServiceItems) },
    { source: "owner", values: [...(input.ownerServices ?? [])] },
    { source: "catalog", values: [...(input.catalogServices ?? [])] },
  ];

  const seen = new Set<string>();
  const services: string[] = [];
  const sources: ServiceOptionSource[] = [];
  for (const tier of tiers) {
    let contributed = false;
    for (const value of tier.values) {
      const trimmed = (value ?? "").trim();
      if (trimmed.length === 0) continue;
      const dedupeKey = trimmed.toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      services.push(trimmed);
      contributed = true;
    }
    if (contributed) sources.push(tier.source);
  }

  return {
    services,
    source: sources[0] ?? "catalog",
    sources,
    fromGoogleProfile: sources.includes("google_profile"),
  };
}

/**
 * Resolve a workspace's effective industry: the catalog entry for
 * `industryKey` (falling back like `getIndustry`), with any workspace-level
 * custom services/attributes/label layered on top. Custom values come first
 * and are deduped against the catalog defaults.
 */
export function resolveWorkspaceIndustry(
  industryKey: string | undefined,
  custom?: { services?: string[]; attributes?: string[]; label?: string },
): Industry;
export function resolveWorkspaceIndustry(
  industryKey: string | undefined,
  custom?: IndustryConfigLike,
): Industry;
export function resolveWorkspaceIndustry(
  industryKey: string | undefined,
  custom?: { services?: string[]; attributes?: string[]; label?: string } | IndustryConfigLike,
): Industry {
  return resolveIndustry(industryKey, normalizeCustom(custom));
}

/**
 * The stored shape of a workspace's industry overrides. Kept structural rather
 * than imported so the catalog stays independent of the data layer.
 */
export interface IndustryConfigLike {
  customLabel?: string;
  customServices?: string[];
  customAttributes?: string[];
}

function normalizeCustom(
  custom?: { services?: string[]; attributes?: string[]; label?: string } | IndustryConfigLike,
): { services?: string[]; attributes?: string[]; label?: string } | undefined {
  if (!custom) return undefined;
  if ("customLabel" in custom || "customServices" in custom || "customAttributes" in custom) {
    const config = custom as IndustryConfigLike;
    return {
      ...(config.customLabel ? { label: config.customLabel } : {}),
      ...(config.customServices ? { services: config.customServices } : {}),
      ...(config.customAttributes ? { attributes: config.customAttributes } : {}),
    };
  }
  return custom as { services?: string[]; attributes?: string[]; label?: string };
}

function resolveIndustry(
  industryKey: string | undefined,
  custom?: { services?: string[]; attributes?: string[]; label?: string },
): Industry {
  const base = getIndustry(industryKey ?? PROFESSIONAL_SERVICES_INDUSTRY.key);
  if (!custom) return base;
  const label = custom.label?.trim();
  return {
    ...base,
    label: label && label.length > 0 ? label : base.label,
    services: mergeUnique(custom.services, base.services),
    attributes: mergeUnique(custom.attributes, base.attributes),
  };
}
