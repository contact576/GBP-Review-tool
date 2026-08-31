/**
 * Default "money query" set, assembled from the workspace's real category,
 * city and services. No vertical is hard-coded anywhere in this file — a
 * physiotherapy clinic and a bakery get the same templates filled with their
 * own words.
 *
 * When the facts needed to write a sensible question are missing, the plan
 * returns fewer (or zero) queries plus blockers explaining what to fix. It
 * never falls back to an example from another industry.
 */

import type { AeoBusinessContext } from "./types";

export const AEO_DEFAULT_QUERY_COUNT = 6;
export const AEO_MAX_QUERIES_PER_RUN = 8;

/** Which profile fact is missing. One id per gap the question set can have. */
export type AeoBlockerId = "category" | "city" | "services";

/**
 * A missing profile fact, stated as the exact thing to add and the exact place
 * in the product where it is added.
 *
 * Structured rather than a sentence so the UI can render the fix and its
 * destination as separate, linkable parts. Nothing here asserts that filling
 * the gap causes an assistant to name the business — no such link is published
 * or measurable. `effect` describes only what the gap does to THIS check.
 */
export interface AeoBlocker {
  id: AeoBlockerId;
  /** True when the gap stops any question being written at all. */
  blocking: boolean;
  /** What to add, in the imperative. */
  fix: string;
  /** The screen where that edit is made, in nav wording. */
  whereLabel: string;
  /** In-app destination for `whereLabel`. */
  href: string;
  /** What the gap does to this check. Never a claim about ranking. */
  effect: string;
}

export interface AeoQueryPlan {
  queries: string[];
  /** Facts the queries were built from — shown so the set is explainable. */
  basis: { category: string; city: string; services: string[] };
  /** Missing profile facts that weaken or block the query set. */
  blockers: AeoBlocker[];
}

/**
 * The catalog of gaps. Every destination here is a screen that actually edits
 * the fact it names: Settings → Business is where the Google profile sync (the
 * source of the category and the service list) is run and shown, and
 * Settings → Locations is where a location's city is set.
 */
const BLOCKERS: Record<AeoBlockerId, AeoBlocker> = {
  category: {
    id: "category",
    blocking: true,
    fix: "Add a primary category to your Google Business Profile, then sync it.",
    whereLabel: "Settings → Business",
    href: "/app/settings/business",
    effect: "Without a category there is nothing to ask about, so no question can be written and no check can run.",
  },
  city: {
    id: "city",
    blocking: false,
    fix: "Set the city on this location.",
    whereLabel: "Settings → Locations",
    href: "/app/settings/locations",
    effect: "Until then the questions say “near me” instead of naming your area.",
  },
  services: {
    id: "services",
    blocking: false,
    fix: "List the services you offer on your Google Business Profile, then sync.",
    whereLabel: "Settings → Business",
    href: "/app/settings/business",
    effect: "Until then the questions stay general and cover none of the specific things people ask for.",
  },
};

/**
 * One-line form, for the few places that can only carry a sentence (the API
 * error body the client turns into a single message).
 */
export function blockerSentence(blocker: AeoBlocker): string {
  return `${blocker.fix} ${blocker.effect}`;
}

export function buildDefaultQueries(
  context: AeoBusinessContext,
  limit: number = AEO_DEFAULT_QUERY_COUNT,
): AeoQueryPlan {
  const category = context.category.trim().toLowerCase();
  const city = context.city.trim();
  const services = context.services.map((service) => service.trim().toLowerCase()).filter(Boolean);
  const blockers: AeoBlocker[] = [];

  if (!category) blockers.push(BLOCKERS.category);
  if (!city) blockers.push(BLOCKERS.city);
  if (services.length === 0) blockers.push(BLOCKERS.services);

  if (!category) {
    return { queries: [], basis: { category: context.category, city, services: context.services }, blockers };
  }

  // "in Toronto" when we know the city, "near me" when we don't — never a
  // borrowed city name.
  const place = city ? `in ${city}` : "near me";
  const [service1, service2, service3] = services;

  // Interleaved so a small limit still spans general intent + specific services.
  const candidates: (string | undefined)[] = [
    `best ${category} ${place}`,
    service1 ? `where can I get ${service1} ${place}` : undefined,
    `which ${category} ${place} has the best reviews`,
    service2 ? `where can I get ${service2} ${place}` : undefined,
    // No leading article: the category is whatever Google calls the business,
    // which may be plural or a noun phrase ("marketing agency", "services",
    // "home services"). "is there a services in Toronto" is not a question a
    // real person would type, and an assistant's answer to it is worthless.
    `${category} ${place} open on the weekend`,
    service3 ? `where can I get ${service3} ${place}` : undefined,
    `affordable ${category} ${place}`,
    `top rated ${category} ${place} taking new customers`,
  ];

  const seen = new Set<string>();
  const queries: string[] = [];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const query = candidate.replace(/\s+/g, " ").trim().slice(0, 140);
    const key = query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    queries.push(query);
    if (queries.length >= Math.max(1, Math.min(limit, AEO_MAX_QUERIES_PER_RUN))) break;
  }

  return { queries, basis: { category: context.category, city, services: context.services }, blockers };
}
