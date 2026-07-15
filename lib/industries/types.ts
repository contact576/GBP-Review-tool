/**
 * Industry catalog types.
 *
 * The industry catalog is the single source of truth for industry-specific
 * content across onboarding, staff capture, the customer review page, AI
 * prompts, and dashboards. Every string in the catalog is short (<= 70 chars)
 * and written for direct display or template assembly.
 */

export type IndustryGroup =
  | "dining"
  | "beauty"
  | "health"
  | "trades"
  | "professional"
  | "auto"
  | "fitness"
  | "hospitality"
  | "retail"
  | "education"
  | "realestate"
  | "other";

export interface Industry {
  /** Stable slug, e.g. "restaurant". */
  key: string;
  /** Display label, e.g. "Restaurant". */
  label: string;
  group: IndustryGroup;
  /** Lowercase substrings matched against Google place types/category text. */
  googleCategories: string[];
  /** 6-10 typical services/offerings. */
  services: string[];
  /** 6-8 POSITIVE review chips (short, tappable, e.g. "Fast service"). */
  attributes: string[];
  /** 2-3 neutral/experience chips (e.g. "First visit"). */
  neutralAttributes: string[];
  /** e.g. guest/visit/server, patient/appointment/practitioner. */
  terminology: { customer: string; visit: string; staff: string };
  /**
   * 1-2 sentences steering the AI reviewer voice for this industry,
   * including what NOT to invent (e.g. clinics: no medical outcome claims).
   */
  promptContext: string;
  /** Template-engine phrase banks: first-person customer voice fragments. */
  phrases: {
    /** 4+ strong-positive experience clauses. */
    experience5: string[];
    /** 3+ solid-but-not-perfect clauses (measured 4-star register). */
    experience4: string[];
    /** 3+ strong closers. */
    closer5: string[];
    /** 2+ measured closers. */
    closer4: string[];
  };
}
