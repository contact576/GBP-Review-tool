import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

/**
 * Drizzle client over the standard Postgres wire protocol (postgres-js).
 *
 * Works against any Postgres — Supabase, Neon, RDS, or self-hosted — because it
 * speaks the real wire protocol rather than a vendor HTTP shim.
 *
 * The connection is created lazily on first use — never at module-eval time —
 * so `next build` (and the whole-project typecheck) succeed without
 * DATABASE_URL. Calling either accessor without DATABASE_URL throws a clear
 * error; the app only reaches this module when DATABASE_URL is set (see
 * lib/data/index.ts).
 */

export type FoundlyDb = PostgresJsDatabase<typeof schema>;
export type FoundlySql = postgres.Sql<Record<string, never>>;

/**
 * Cached on globalThis, not module scope: Next.js dev hot-reload re-evaluates
 * modules, and a fresh pool per reload exhausts the database's connection slots.
 */
const globalRef = globalThis as unknown as {
  __foundlySql?: FoundlySql;
  __foundlyDb?: FoundlyDb;
};

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. The Postgres/Drizzle provider requires it — " +
        "set DATABASE_URL to a Postgres connection string (Supabase, Neon, or " +
        "standard Postgres), or leave it unset to use the in-memory demo provider.",
    );
  }
  return url;
}

/**
 * Transaction-mode poolers (Supabase Supavisor on port 6543, PgBouncer) do not
 * support prepared statements, so they must be disabled. Detected from the URL
 * so a session-mode/direct connection keeps the faster prepared path.
 */
function usesTransactionPooler(url: string): boolean {
  return (
    url.includes("6543") ||
    url.includes("pgbouncer=true") ||
    url.includes("pooler.supabase.com")
  );
}

/** The raw postgres-js SQL tagged-template function. */
export function getSql(): FoundlySql {
  if (!globalRef.__foundlySql) {
    const url = connectionString();
    globalRef.__foundlySql = postgres(url, {
      // A single request is NOT a single query: getData() alone fans out 21
      // reads through Promise.all. With max:1 those serialize into 21 sequential
      // round trips — on a cross-region database (~140ms RTT) that turned one
      // page render into 8s and made /agency exceed a 45s navigation timeout.
      // The pool must be wide enough to actually run that fan-out in parallel.
      //
      // Kept modest because Supavisor/PgBouncer multiplexes on its side: this is
      // per warm instance, not per request, and idle sockets are reaped below.
      max: 8,
      // Serverless instances freeze between requests. A socket the pooler
      // closed while the instance was frozen looks alive on thaw, and the
      // first query written to it waits on a reply that never comes — there
      // is no query timeout, so the request hangs (2026-09-04, /admin pages
      // hanging while pg_stat_activity showed everything idle). Keepalives
      // surface a dead peer, and short idle/lifetime windows mean a thawed
      // instance reconnects instead of reusing a stale socket.
      idle_timeout: 10,
      max_lifetime: 60 * 5,
      keep_alive: 20,
      connect_timeout: 10,
      prepare: !usesTransactionPooler(url),
      // Managed Postgres requires TLS. `sslmode` in the URL takes precedence
      // when present; this is the fallback for bare connection strings.
      ssl: url.includes("sslmode=") ? undefined : "require",
      // Never let a driver notice crash a request path.
      onnotice: () => {},
    });
  }
  return globalRef.__foundlySql;
}

/** The Drizzle database instance bound to the full schema. */
export function getDb(): FoundlyDb {
  if (!globalRef.__foundlyDb) {
    globalRef.__foundlyDb = drizzle(getSql(), { schema });
  }
  return globalRef.__foundlyDb;
}

export { schema };
