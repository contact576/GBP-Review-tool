import { describe, it, expect, beforeAll } from "vitest";
import type { Session } from "@/lib/auth/session";

/**
 * Guards the provider-routing invariant behind sign-up / sign-in / Google.
 *
 * Regression context: auth flows once called `getProviderFor(null)`, which
 * returns the in-memory DEMO store. On serverless, accounts were written to
 * one instance's memory and never found again — "invalid credentials" on the
 * next request, and Google sign-in bounced back to the sign-in page. Real
 * auth must resolve to the SAME real provider that logged-in page reads use.
 */

// DATABASE_URL must be set before importing the module (provider is chosen at
// call time from the env). A dummy URL is enough — no connection is opened
// unless a query runs, which these selection checks never do.
process.env.DATABASE_URL ||= "postgres://user:pass@localhost:5432/foundly_test";

let mod: typeof import("@/lib/data");

beforeAll(async () => {
  mod = await import("@/lib/data");
  // Warm the cached Postgres provider in the hook, not inside a test. The first
  // getRealProvider() call dynamically imports the (large) drizzle provider,
  // which can exceed vitest's 5s default test timeout on a loaded machine and
  // fail spuriously. No connection is opened — only a module import.
  await mod.getRealProvider();
}, 60_000);

const realSession: Session = {
  userId: "usr_x",
  workspaceId: "ws_x",
  role: "owner",
  isDemo: false,
  name: "Real Owner",
  email: "owner@example.com",
};
const demoSession: Session = { ...realSession, isDemo: true };

describe("data provider selection", () => {
  it("routes real accounts (sign-up/login/Google) to the postgres provider", async () => {
    const real = await mod.getRealProvider();
    expect(real.backed).toBe("postgres");
  });

  it("routes a real (non-demo) session to the postgres provider", async () => {
    const provider = await mod.getProviderFor(realSession);
    expect(provider.backed).toBe("postgres");
  });

  it("routes demo sessions to the in-memory store, never the database", async () => {
    const provider = await mod.getProviderFor(demoSession);
    expect(provider.backed).toBe("memory");
  });

  it("never lets the real-account provider fall back to the demo store", async () => {
    // The exact bug: getProviderFor(null) is the demo store; getRealProvider
    // must NOT be that store when a database is configured.
    const real = await mod.getRealProvider();
    const noSession = await mod.getProviderFor(null);
    expect(noSession.backed).toBe("memory");
    expect(real).not.toBe(noSession);
    expect(real.backed).toBe("postgres");
  });
});
