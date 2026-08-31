/**
 * The rules for the owner's own service list (`IndustryConfig.customServices`).
 *
 * Framework-free on purpose: the server action in `lib/actions.ts` and the
 * Settings → Business editor both import it, so what the editor shows before a
 * save and what the action actually stores can never drift apart.
 *
 * The limits are not invented — each one mirrors a real consumer:
 *  - `REVIEW_PICKER_LIMIT`  → `ReviewFlow` slices `serviceOptions` to 10.
 *  - `AEO_QUESTION_LIMIT`   → `lib/aeo/context.ts` `MAX_SERVICES` = 6.
 *  - `MAX_SERVICE_LENGTH`   → `lib/aeo/context.ts` truncates at 60 characters.
 *  - `MIN_SERVICE_LENGTH`   → `lib/aeo/context.ts` drops anything shorter.
 * Entries that a consumer would silently drop are rejected at save time rather
 * than stored and quietly ignored later.
 */

/** Options the customer review page can show (`ReviewFlow` slices to this). */
export const REVIEW_PICKER_LIMIT = 10;

/** Services AI Visibility builds questions from (`lib/aeo/context.ts`). */
export const AEO_QUESTION_LIMIT = 6;

/** Most services an owner can store. Beyond this nothing would ever be shown. */
export const MAX_OWNER_SERVICES = REVIEW_PICKER_LIMIT;

/** Longest a single service can be before AI Visibility would truncate it. */
export const MAX_SERVICE_LENGTH = 60;

/** Shortest a single service can be before AI Visibility would drop it. */
export const MIN_SERVICE_LENGTH = 3;

export interface NormalizedOwnerServices {
  /** Clean, trimmed, case-insensitively deduped values, in the owner's order. */
  services: string[];
  /** How many entries were dropped as repeats of an earlier one. */
  duplicatesRemoved: number;
  /** Entries below `MIN_SERVICE_LENGTH`, as the owner typed them. */
  tooShort: string[];
  /** Entries above `MAX_SERVICE_LENGTH`, as the owner typed them. */
  tooLong: string[];
  /** How many valid entries there were beyond `MAX_OWNER_SERVICES`. */
  overflow: number;
}

/** Drop C0/C1 control characters without a regex (keeps `no-control-regex` happy). */
function stripControlCharacters(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 32 || code === 127) continue;
    out += char;
  }
  return out;
}

/** "  deep   cleaning " -> "deep cleaning". */
export function cleanServiceValue(value: string): string {
  return stripControlCharacters(value).replace(/\s+/g, " ").trim();
}

/**
 * Apply every rule above to a raw list. Blanks vanish silently (they are just
 * empty rows in the editor); everything else is reported so the caller can tell
 * the owner exactly what happened instead of changing their list behind them.
 */
export function normalizeOwnerServices(raw: readonly string[]): NormalizedOwnerServices {
  const services: string[] = [];
  const tooShort: string[] = [];
  const tooLong: string[] = [];
  const seen = new Set<string>();
  let duplicatesRemoved = 0;

  for (const entry of raw) {
    const value = cleanServiceValue(typeof entry === "string" ? entry : "");
    if (value.length === 0) continue;
    if (value.length < MIN_SERVICE_LENGTH) {
      tooShort.push(value);
      continue;
    }
    if (value.length > MAX_SERVICE_LENGTH) {
      tooLong.push(value);
      continue;
    }
    const dedupeKey = value.toLowerCase();
    if (seen.has(dedupeKey)) {
      duplicatesRemoved += 1;
      continue;
    }
    seen.add(dedupeKey);
    services.push(value);
  }

  const overflow = Math.max(0, services.length - MAX_OWNER_SERVICES);
  return { services, duplicatesRemoved, tooShort, tooLong, overflow };
}

/**
 * The single blocking problem with a list, or null when it can be saved.
 * Shared so the editor's disabled Save button and the action's rejection can
 * never disagree about what is wrong.
 */
export function ownerServicesProblem(result: NormalizedOwnerServices): string | null {
  if (result.tooShort.length > 0) {
    return `Each service needs at least ${MIN_SERVICE_LENGTH} characters. Check: ${result.tooShort.join(", ")}.`;
  }
  if (result.tooLong.length > 0) {
    return `Keep each service to ${MAX_SERVICE_LENGTH} characters or fewer. Check: ${result.tooLong
      .map((value) => `${value.slice(0, 24)}…`)
      .join(", ")}.`;
  }
  if (result.overflow > 0) {
    return `You can save up to ${MAX_OWNER_SERVICES} services. Remove ${result.overflow} to save.`;
  }
  return null;
}
