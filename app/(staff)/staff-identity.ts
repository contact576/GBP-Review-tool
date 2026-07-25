import { getSessionAndData } from "@/lib/data";
import type { Session } from "@/lib/auth/session";
import type { FoundlyData, StaffMember } from "@/lib/data/types";

/**
 * Who is actually standing at the front desk?
 *
 * The staff PWA is a signed-in surface, so the person using it must be the
 * person who gets the credit. `StaffMember` carries no `userId`/`email`
 * column (see lib/data/types.ts and lib/db/schema.ts — `staff_member` is
 * created from a display name by `addStaffMember`), so the only real linkage
 * the data model offers is the roster's `displayName` against the session's
 * account identity.
 *
 * Matching is deliberately strict — a wrong match credits a real person's
 * captures to somebody else, which is worse than showing no credit at all:
 *   1. normalised full name  === normalised `session.name`
 *   2. normalised full name  === normalised local part of `session.email`
 *      ("priya.sharma@…" -> "priyasharma" === "Priya Sharma")
 * Anything looser (first-name-only, fuzzy) is rejected, and more than one hit
 * counts as no hit at all.
 */

/** The seeded demo front-desk operator in the Harbourview tenant. */
const DEMO_STAFF_ID = "stf_priya";

export type UnlinkedReason = "empty_roster" | "no_match" | "ambiguous";

export interface StaffIdentity {
  session: Session;
  data: FoundlyData;
  /** The roster row the signed-in person *is*, or null when nothing links them. */
  staff: StaffMember | null;
  /** Only set when `staff` is null — drives the honest empty state. */
  unlinkedReason: UnlinkedReason | null;
  /** The whole roster in leaderboard order (captures desc, then name). */
  roster: StaffMember[];
  /** 1-based position in `roster`; 0 when unlinked. */
  rank: number;
  /** Name for the chrome: the roster row's, else the signed-in account's. */
  displayName: string;
  /** Avatar initials to match `displayName`. */
  initials: string;
  /** Owner/manager can fix the linkage themselves in Settings -> Team. */
  canManageTeam: boolean;
}

/** Comparison key: diacritics folded, case folded, punctuation/spacing dropped. */
function foldKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function emailLocalPart(email: string): string {
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : "";
}

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return "FD";
  const last = parts.length > 1 ? parts[parts.length - 1] : undefined;
  const initials = `${first[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase();
  return initials || "FD";
}

/** Exactly-one-hit lookup. Zero or multiple hits both resolve to "no match". */
function matchRoster(
  roster: StaffMember[],
  candidateKey: string,
): { staff: StaffMember | null; ambiguous: boolean } {
  if (!candidateKey) return { staff: null, ambiguous: false };
  const hits = roster.filter((s) => foldKey(s.displayName) === candidateKey);
  if (hits.length === 1) {
    const only = hits[0];
    if (only) return { staff: only, ambiguous: false };
  }
  return { staff: null, ambiguous: hits.length > 1 };
}

/** Pure resolver — session + tenant data in, identity out. */
export function resolveStaffIdentity(session: Session, data: FoundlyData): StaffIdentity {
  const roster = [...data.staff].sort(
    (a, b) => b.captures - a.captures || a.displayName.localeCompare(b.displayName),
  );

  let matched: StaffMember | null = null;
  let unlinkedReason: UnlinkedReason | null = null;

  if (roster.length === 0) {
    unlinkedReason = "empty_roster";
  } else {
    const byName = matchRoster(roster, foldKey(session.name));
    const byEmail =
      byName.staff || byName.ambiguous
        ? { staff: null, ambiguous: false }
        : matchRoster(roster, foldKey(emailLocalPart(session.email)));
    matched = byName.staff ?? byEmail.staff;
    if (!matched) {
      unlinkedReason = byName.ambiguous || byEmail.ambiguous ? "ambiguous" : "no_match";
    }
  }

  // Demo sessions keep the seeded operator so the walkthrough still shows the
  // full per-staff attribution flow. Real workspaces never fall back.
  if (!matched && session.isDemo) {
    const demo = roster.find((s) => s.id === DEMO_STAFF_ID) ?? roster[0];
    if (demo) {
      matched = demo;
      unlinkedReason = null;
    }
  }

  const me = matched;
  const rank = me ? roster.findIndex((s) => s.id === me.id) + 1 : 0;
  const accountName = session.name.trim() || emailLocalPart(session.email) || "Front desk";
  const displayName = me?.displayName ?? accountName;

  return {
    session,
    data,
    staff: me,
    unlinkedReason,
    roster,
    rank,
    displayName,
    initials: me?.avatarInitials ?? initialsFrom(displayName),
    canManageTeam: session.role === "owner" || session.role === "manager",
  };
}

/** Server-side entry point for the staff PWA routes. */
export async function getStaffIdentity(): Promise<StaffIdentity> {
  const { session, data } = await getSessionAndData();
  return resolveStaffIdentity(session, data);
}
