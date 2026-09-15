/**
 * Provision a real, demo-ready tenant — `npm run db:provision`.
 *
 *   npm run db:provision -- --email you@example.com --password 'Str0ngPass' \
 *     --business "Priority Plumbing & Drains Toronto" --industry plumbing \
 *     --region CA --tier pro
 *
 * Everything this creates is REAL:
 *   - the account is created through the same provider the sign-up form uses
 *     (bcrypt hash, real workspace, real subscription row)
 *   - the business is matched against the live Google Places API (New)
 *   - the rating, review count and review samples are pulled from Google
 *
 * The only operator override is `--tier`. Plan tier is a commercial setting, not
 * data: on a real account the UI routes plan changes to Stripe, which is out of
 * scope, so tier is set directly here. Features it unlocks (e.g. the rank grid)
 * still run against live Google data — nothing is simulated.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadDotEnv(): void {
  for (const file of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), file);
    if (!existsSync(path)) continue;
    for (const rawLine of readFileSync(path, "utf8").split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const VALID_TIERS = ["free", "starter", "growth", "multi", "agency"] as const;
type Tier = (typeof VALID_TIERS)[number];

async function main(): Promise<void> {
  loadDotEnv();

  const email = arg("email");
  const password = arg("password");
  const business = arg("business");
  const industry = arg("industry") ?? "plumbing";
  const region = (arg("region") ?? "CA") === "US" ? "US" : "CA";
  const tier = (arg("tier") ?? "growth") as Tier;
  const ownerName = arg("name") ?? "Foundly Owner";

  if (!email || !password || !business) {
    throw new Error(
      "Required: --email <address> --password <password> --business \"<name and city>\".\n" +
        "Optional: --industry <key> --region CA|US --tier " + VALID_TIERS.join("|") + " --name \"Owner Name\"",
    );
  }
  if (!VALID_TIERS.includes(tier)) {
    throw new Error(`--tier must be one of: ${VALID_TIERS.join(", ")}`);
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    throw new Error("GOOGLE_MAPS_API_KEY is not set — the business could only be created without real Google data.");
  }

  const { drizzleProvider } = await import("../data/drizzle-provider");
  const { searchBusinesses } = await import("../google/places");
  const { getSql } = await import("./client");

  // ── 1. Real account ──────────────────────────────────────
  console.log(`\n[provision] Creating account ${email}…`);
  const registered = await drizzleProvider.registerUser({
    name: ownerName,
    email,
    password,
    businessName: business,
    industryKey: industry,
    region,
  });
  if (!registered.ok) throw new Error(`Registration failed: ${registered.error}`);
  const ws = registered.user.workspaceId;
  console.log(`[provision] Workspace ${ws}`);

  // ── 2. Real Google match ─────────────────────────────────
  console.log(`[provision] Searching Google Places for "${business}"…`);
  const found = await searchBusinesses(business, region);
  if (!found.ok || found.places.length === 0) {
    throw new Error(`No Google match for "${business}" (${found.ok ? "no results" : found.reason}).`);
  }
  const place = found.places[0];
  if (!place) throw new Error(`No Google match for "${business}".`);
  console.log(`[provision] Matched: ${place.name} — ${place.address} (${place.rating}★, ${place.reviewCount} reviews)`);

  await drizzleProvider.updateLocationGoogle(ws, {
    placeId: place.placeId,
    name: place.name,
    address: place.address,
    city: place.city,
    category: place.category,
    rating: place.rating,
    reviewCount: place.reviewCount,
  });

  // ── 3. Real review sample from Google ────────────────────
  console.log("[provision] Syncing public Google data…");
  const sync = await drizzleProvider.syncGooglePublic(ws);
  if (!sync.ok) throw new Error(`Google sync failed: ${sync.error}`);
  console.log(
    `[provision] Synced ${sync.rating}★ from ${sync.reviewCount} reviews · ` +
      `${sync.reviewsImported ?? 0} public review samples imported`,
  );

  // ── 4. Plan tier (operator override — see file header) ───
  await drizzleProvider.setSubscription(ws, { tier, status: "active" });
  console.log(`[provision] Plan set to "${tier}" (status active)`);

  const sql = getSql();
  const check = await sql<{ tier: string; status: string; reviews: number }[]>`
    SELECT s.tier, s.status,
           (SELECT count(*)::int FROM review r WHERE r.workspace_id = ${ws}) AS reviews
    FROM subscription s WHERE s.workspace_id = ${ws}`;
  console.log(
    `[provision] Verified in Postgres: tier=${check[0]?.tier} status=${check[0]?.status} ` +
      `reviews=${check[0]?.reviews}`,
  );
  await sql.end({ timeout: 5 });

  console.log(`\n[provision] Ready. Sign in at /sign-in as ${email}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("\n[provision] Failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
