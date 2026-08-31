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

export interface AeoQueryPlan {
  queries: string[];
  /** Facts the queries were built from — shown so the set is explainable. */
  basis: { category: string; city: string; services: string[] };
  /** Missing profile facts that weaken or block the query set. */
  blockers: string[];
}

export function buildDefaultQueries(
  context: AeoBusinessContext,
  limit: number = AEO_DEFAULT_QUERY_COUNT,
): AeoQueryPlan {
  const category = context.category.trim().toLowerCase();
  const city = context.city.trim();
  const services = context.services.map((service) => service.trim().toLowerCase()).filter(Boolean);
  const blockers: string[] = [];

  if (!category) {
    blockers.push("Add a primary category to your Google profile — questions can't be written without it.");
  }
  if (!city) {
    blockers.push("Add your city so questions can ask about your area rather than anywhere.");
  }
  if (services.length === 0) {
    blockers.push("List your services so questions can cover what people actually search for.");
  }

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
    `is there a ${category} ${place} open on the weekend`,
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
