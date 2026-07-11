import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

/**
 * Drizzle client over Neon's serverless HTTP driver.
 *
 * The connection is created lazily on first use — never at module-eval time —
 * so `next build` (and the whole-project typecheck) succeed without
 * DATABASE_URL. Calling either accessor without DATABASE_URL throws a clear
 * error; the app only reaches this module when DATABASE_URL is set (see
 * lib/data/index.ts).
 */

export type FoundlyDb = NeonHttpDatabase<typeof schema>;
export type FoundlySql = NeonQueryFunction<false, false>;

let cachedSql: FoundlySql | null = null;
let cachedDb: FoundlyDb | null = null;

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. The Postgres/Drizzle provider requires it — " +
        "set DATABASE_URL to a Neon connection string, or leave it unset to " +
        "use the in-memory demo provider.",
    );
  }
  return url;
}

/** The raw Neon SQL tagged-template function (pool equivalent for neon-http). */
export function getSql(): FoundlySql {
  if (!cachedSql) {
    cachedSql = neon(connectionString());
  }
  return cachedSql;
}

/** The Drizzle database instance bound to the full schema. */
export function getDb(): FoundlyDb {
  if (!cachedDb) {
    cachedDb = drizzle(getSql(), { schema });
  }
  return cachedDb;
}

export { schema };
