import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit config for `npm run db:push` / `db:generate`.
 * The connection string is read from the environment (never at import for the
 * app runtime — this file is only loaded by the drizzle-kit CLI).
 */
export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
