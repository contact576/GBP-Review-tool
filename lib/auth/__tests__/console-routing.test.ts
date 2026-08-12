import { describe, expect, it } from "vitest";
import type { SessionRole } from "@/lib/auth/session";

/**
 * Which console each role belongs in.
 *
 * Mirrors the role gates in `middleware.ts`. `/app` was originally the one
 * protected prefix with no role gate, so an agency or platform admin walked
 * straight in; the pages rendered at HTTP 200 but every server action behind
 * them calls `requireRole()`, which throws — and an uncaught throw in a server
 * action is a 500, not a redirect. The result was a console that looked fine
 * until the first button, then dropped the user on the error boundary.
 *
 * Kept as a table so the intended destination is stated once and the no-loop
 * property below is checkable rather than argued.
 */
function consoleFor(role: SessionRole, pathname: string): string | null {
  if (pathname.startsWith("/admin") && role !== "platform_admin") return "/app";
  if (pathname.startsWith("/agency") && role !== "agency_admin" && role !== "owner") return "/app";
  if (pathname.startsWith("/app")) {
    if (role === "agency_admin") return "/agency";
    if (role === "platform_admin") return "/admin";
  }
  return null;
}

const ROLES: SessionRole[] = ["owner", "manager", "staff", "agency_admin", "platform_admin"];

describe("console role routing", () => {
  it("keeps the owner console for the roles that own a workspace", () => {
    for (const role of ["owner", "manager", "staff"] as SessionRole[]) {
      expect(consoleFor(role, "/app")).toBeNull();
      expect(consoleFor(role, "/app/visibility")).toBeNull();
    }
  });

  it("sends an agency admin to its own console instead of a 500 on every button", () => {
    expect(consoleFor("agency_admin", "/app")).toBe("/agency");
    expect(consoleFor("agency_admin", "/app/settings/billing")).toBe("/agency");
  });

  it("sends a platform admin to its own console", () => {
    expect(consoleFor("platform_admin", "/app")).toBe("/admin");
    expect(consoleFor("platform_admin", "/app/reviews")).toBe("/admin");
  });

  it("still guards /admin and /agency as before", () => {
    expect(consoleFor("owner", "/admin")).toBe("/app");
    expect(consoleFor("agency_admin", "/admin")).toBe("/app");
    expect(consoleFor("platform_admin", "/admin")).toBeNull();
    expect(consoleFor("staff", "/agency")).toBe("/app");
    expect(consoleFor("owner", "/agency")).toBeNull();
    expect(consoleFor("agency_admin", "/agency")).toBeNull();
  });

  it("never redirects in a loop, from any role and any console entry point", () => {
    for (const role of ROLES) {
      for (const start of ["/app", "/agency", "/admin"]) {
        const seen = new Set<string>();
        let at = start;
        // Follow the chain; it must settle rather than revisit a path.
        for (let hop = 0; hop < 10; hop++) {
          const next = consoleFor(role, at);
          if (next === null) break;
          expect(seen.has(next)).toBe(false);
          seen.add(next);
          at = next;
        }
        expect(consoleFor(role, at)).toBeNull();
      }
    }
  });
});
