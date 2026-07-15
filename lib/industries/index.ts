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

/**
 * Resolve a workspace's effective industry: the catalog entry for
 * `industryKey` (falling back like `getIndustry`), with any workspace-level
 * custom services/attributes/label layered on top. Custom values come first
 * and are deduped against the catalog defaults.
 */
export function resolveWorkspaceIndustry(
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
