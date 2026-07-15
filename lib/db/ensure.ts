import { SCHEMA_STATEMENTS } from "./schema-sql";

/**
 * Self-service schema setup — lets the deployed app initialize its own
 * Postgres schema (no terminal needed). All DDL is IF-NOT-EXISTS idempotent.
 * Runs via the neon-http driver, which works on Vercel serverless.
 */

const globalRef = globalThis as unknown as { __foundlySchemaReady?: boolean };

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
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(process.env.DATABASE_URL);

    // Fast path: newest table already present → schema is current.
    const probe = await sql`
      SELECT 1 FROM information_schema.tables
      WHERE table_name = 'qr_asset' LIMIT 1`;
    if (probe.length > 0) {
      globalRef.__foundlySchemaReady = true;
      return { ok: true, ran: false };
    }

    for (const statement of SCHEMA_STATEMENTS) {
      // Ordinary function-call form executes a raw SQL string.
      await sql(statement);
    }
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
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(process.env.DATABASE_URL);
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
