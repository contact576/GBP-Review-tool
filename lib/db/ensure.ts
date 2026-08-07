import { SCHEMA_STATEMENTS, ADDITIVE_STATEMENTS } from "./schema-sql";

/**
 * Self-service schema setup — lets the deployed app initialize its own
 * Postgres schema (no terminal needed). All DDL is IF-NOT-EXISTS idempotent.
 * Runs via the neon-http driver, which works on Vercel serverless.
 */

const globalRef = globalThis as unknown as {
  __foundlySchemaReady?: boolean;
  __foundlyAdditiveReady?: boolean;
};

/**
 * `unsafe()` returns postgres-js's PendingQuery, which is a thenable that also
 * exposes `.simple()`. Multi-statement strings REQUIRE the simple protocol —
 * the default extended protocol rejects them with "cannot insert multiple
 * commands into a prepared statement".
 */
type PendingQuery = Promise<unknown> & { simple?: () => Promise<unknown> };
type Sql = { unsafe: (statement: string) => PendingQuery };

/**
 * Run additive migrations (new tables/columns) even when the core schema
 * already exists — the fast-path below skips the full list, so tenants created
 * before a feature landed would otherwise miss its tables.
 */
async function runAdditive(sql: Sql): Promise<void> {
  if (globalRef.__foundlyAdditiveReady) return;

  // Sent as ONE round trip rather than one per statement.
  // `__foundlyAdditiveReady` lives on per-instance globalThis, so every cold
  // Vercel lambda re-ran this list; at ~45 statements against Tokyo that was
  // seconds of boot latency holding pool connections the first real request was
  // queued behind. Every statement is IF NOT EXISTS, so replaying is idempotent.
  const batch = ADDITIVE_STATEMENTS.join(";\n");
  try {
    const pending = sql.unsafe(batch);
    // Fall back to awaiting the query directly if `.simple` is ever absent
    // (a different driver, or a test double) — a single statement still works.
    await (typeof pending.simple === "function" ? pending.simple() : pending);
  } catch {
    // Correctness beats the round-trip saving: if the batch is rejected for any
    // reason, replay one statement at a time so a new column still lands. A
    // half-applied schema is what takes production down, not a slow boot.
    for (const statement of ADDITIVE_STATEMENTS) {
      await sql.unsafe(statement);
    }
  }
  globalRef.__foundlyAdditiveReady = true;
}

export interface EnsureResult {
  ok: boolean;
  ran: boolean;
  error?: string;
}

export async function ensureSchema(): Promise<EnsureResult> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, ran: false, error: "DATABASE_URL is not set" };
  }
  if (globalRef.__foundlySchemaReady) return { ok: true, ran: false };

  try {
    const { getSql } = await import("./client");
    const sql = getSql();

    // Fast path: newest core table already present → schema is current. Still
    // run additive migrations so pre-existing tenants pick up new tables.
    const probe = await sql`
      SELECT 1 FROM information_schema.tables
      WHERE table_name = 'qr_asset' LIMIT 1`;
    if (probe.length > 0) {
      await runAdditive(sql);
      globalRef.__foundlySchemaReady = true;
      return { ok: true, ran: false };
    }

    for (const statement of SCHEMA_STATEMENTS) {
      // `unsafe` runs a raw (non-parameterized) DDL string. The statements are
      // compile-time constants from schema-sql.ts — no user input reaches here.
      await sql.unsafe(statement);
    }
    // SCHEMA_STATEMENTS does NOT subsume ADDITIVE_STATEMENTS: columns added
    // after the base DDL was generated (app_user.session_version,
    // subscription.stripe_*, workspace.referral_*, location.gbp_*) exist only as
    // ALTERs here. Skipping them on first init left every fresh database without
    // session_version, which made all auth queries fail. Every additive
    // statement is IF NOT EXISTS, so running them after a full init is safe.
    await runAdditive(sql);
    globalRef.__foundlySchemaReady = true;
    return { ok: true, ran: true };
  } catch (err) {
    return {
      ok: false,
      ran: false,
      error: err instanceof Error ? err.message : "Unknown database error",
    };
  }
}

/** Connectivity + schema status for the setup checklist (no writes). */
export async function checkDatabase(): Promise<{
  configured: boolean;
  reachable: boolean;
  schemaReady: boolean;
  error?: string;
}> {
  if (!process.env.DATABASE_URL) {
    return { configured: false, reachable: false, schemaReady: false };
  }
  try {
    const { getSql } = await import("./client");
    const sql = getSql();
    const probe = await sql`
      SELECT 1 FROM information_schema.tables
      WHERE table_name = 'qr_asset' LIMIT 1`;
    return { configured: true, reachable: true, schemaReady: probe.length > 0 };
  } catch (err) {
    return {
      configured: true,
      reachable: false,
      schemaReady: false,
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }
}
