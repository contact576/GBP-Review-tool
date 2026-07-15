/**
 * Seed runner — `npm run db:seed` (executed with tsx).
 *
 * Loads env from the process (Vercel/Neon style) and, if a local `.env` file
 * exists, does a tiny manual parse of it (no dotenv dependency). Then clears
 * every table and inserts the full demo dataset (core tables — including the
 * relational qr_asset rows — + the single dataset_meta JSONB row). The demo
 * workspace is written with is_demo = true. Exits 0 on success, 1 on failure.
 *
 * Dev convenience only: at runtime the demo is served by the memory provider.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { buildSeed } from "../data/seed";
import { clearAllTables, seedDatabase } from "../data/drizzle-provider";

/** Minimal `.env` reader — sets vars that aren't already in the environment. */
function loadDotEnv(): void {
  const path = resolve(process.cwd(), ".env");
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

async function main(): Promise<void> {
  loadDotEnv();

  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Provide it in the environment or a local .env " +
        "file before running `npm run db:seed`.",
    );
  }

  console.log("[seed] Clearing existing rows…");
  await clearAllTables();

  console.log("[seed] Building demo dataset…");
  const data = buildSeed();

  console.log("[seed] Inserting rows…");
  await seedDatabase(data);

  console.log(
    `[seed] Done. Inserted ${data.staff.length} staff, ${data.customers.length} customers, ` +
      `${data.requests.length} requests, ${data.reviews.length} reviews, ` +
      `${data.campaigns.length} campaigns, ${data.qrAssets.length} QR assets, ` +
      `and 1 dataset_meta row.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("[seed] Failed:", err);
    process.exit(1);
  });
