/**
 * Database verification — `npm run db:verify`.
 *
 * Proves a real Postgres (Supabase, Neon, or self-hosted) is genuinely wired up,
 * end to end, with no fake values anywhere in the path:
 *
 *   1. connects over the standard wire protocol
 *   2. creates the schema if absent (idempotent DDL)
 *   3. asserts every table the app writes to actually exists
 *   4. asserts app_user carries every column the auth flow depends on
 *   5. registers a REAL account through the same provider the app uses,
 *      logs in with it, reads the tenant back, then removes it
 *
 * Read-only against existing tenants: the round-trip account is scoped to its
 * own workspace and deleted by id afterwards. Exits 0 on success, 1 on failure.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";

/** Minimal env reader — mirrors seed-runner, checks .env.local then .env. */
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
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

const EXPECTED_TABLES = [
  "organization", "workspace", "location", "app_user", "password_reset_token",
  "staff_invite", "staff_member", "customer", "customer_consent", "review_request",
  "review", "review_reply", "review_draft", "gbp_task", "campaign", "subscription",
  "private_feedback", "notification", "audit_log", "qr_asset", "dataset_meta",
  "google_credential", "instagram_credential", "email_credential",
  "profile_mutation_job", "content_publishing_job", "monitoring_run",
  "ai_content_asset",
];

const REQUIRED_USER_COLUMNS = [
  "id", "workspace_id", "email", "name", "role", "password_hash",
  "email_verified", "google_sub", "created_at", "session_version",
];

let failures = 0;
function pass(label: string, detail = ""): void {
  console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`);
}
function fail(label: string, detail: string): void {
  failures += 1;
  console.error(`  FAIL  ${label} — ${detail}`);
}

async function main(): Promise<void> {
  loadDotEnv();

  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Put the Postgres connection string in .env.local " +
        "(Supabase: Project Settings → Database → Connection string → Transaction).",
    );
  }

  const host = (() => {
    try {
      return new URL(process.env.DATABASE_URL!).host;
    } catch {
      return "unparseable-url";
    }
  })();
  console.log(`\n[verify] Target: ${host}\n`);

  const { getSql } = await import("./client");
  const sql = getSql();

  // ── 1. Connectivity ──────────────────────────────────────
  console.log("1. Connectivity");
  const version = await sql<{ version: string }[]>`SELECT version()`;
  pass("connected", version[0]?.version.split(",")[0] ?? "unknown server");

  // ── 2. Schema creation (idempotent) ──────────────────────
  console.log("\n2. Schema");
  const { ensureSchema } = await import("./ensure");
  const ensured = await ensureSchema();
  if (!ensured.ok) {
    fail("ensureSchema", ensured.error ?? "unknown error");
    throw new Error("Cannot continue without a schema.");
  }
  pass("ensureSchema", ensured.ran ? "created tables" : "already present");

  // ── 3. Every expected table exists ───────────────────────
  console.log("\n3. Tables");
  const present = new Set(
    (
      await sql<{ table_name: string }[]>`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'`
    ).map((r) => r.table_name),
  );
  const missingTables = EXPECTED_TABLES.filter((name) => !present.has(name));
  if (missingTables.length > 0) {
    fail("tables", `missing: ${missingTables.join(", ")}`);
  } else {
    pass("tables", `all ${EXPECTED_TABLES.length} present`);
  }

  // ── 4. app_user has every auth column ────────────────────
  console.log("\n4. Auth columns");
  const userCols = new Set(
    (
      await sql<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'app_user'`
    ).map((r) => r.column_name),
  );
  const missingCols = REQUIRED_USER_COLUMNS.filter((c) => !userCols.has(c));
  if (missingCols.length > 0) {
    fail("app_user columns", `missing: ${missingCols.join(", ")}`);
  } else {
    pass("app_user columns", `all ${REQUIRED_USER_COLUMNS.length} present`);
  }

  // ── 5. Real account round trip through the app's provider ─
  console.log("\n5. Live account round trip");
  const { drizzleProvider } = await import("../data/drizzle-provider");
  if (drizzleProvider.backed !== "postgres") {
    fail("provider", `expected postgres, got ${drizzleProvider.backed}`);
  } else {
    pass("provider", "postgres-backed");
  }

  const suffix = randomBytes(6).toString("hex");
  const email = `db-verify+${suffix}@foundly.invalid`;
  const password = `Verify-${randomBytes(12).toString("base64url")}`;
  let workspaceId: string | null = null;
  let organizationId: string | null = null;
  let userId: string | null = null;

  try {
    const registered = await drizzleProvider.registerUser({
      name: "Database Verification",
      email,
      password,
      businessName: `Verification Co ${suffix}`,
      industryKey: "plumbing",
      region: "CA",
    });
    if (!registered.ok) {
      fail("registerUser", registered.error);
    } else {
      userId = registered.user.id;
      workspaceId = registered.user.workspaceId;
      pass("registerUser", `workspace ${workspaceId}`);

      // Password must verify against the stored bcrypt hash.
      const loggedIn = await drizzleProvider.verifyCredentials(email, password);
      if (!loggedIn || loggedIn.id !== userId) {
        fail("verifyCredentials", "correct password did not authenticate");
      } else {
        pass("verifyCredentials", "correct password accepted");
      }

      // A wrong password must be rejected.
      const rejected = await drizzleProvider.verifyCredentials(email, `${password}x`);
      if (rejected) {
        fail("verifyCredentials", "WRONG password was accepted");
      } else {
        pass("verifyCredentials", "wrong password rejected");
      }

      // The tenant must read back as a complete dataset.
      const data = await drizzleProvider.getData(workspaceId);
      if (!data) {
        fail("getData", "workspace read back as null");
      } else {
        organizationId = data.organization.id;
        pass(
          "getData",
          `${data.location.name} · plan ${data.subscription.tier} · ` +
            `${data.qrAssets.length} qr · ${data.notifications.length} notifications`,
        );
      }

      // Duplicate email must be refused (unique-account invariant).
      const duplicate = await drizzleProvider.registerUser({
        name: "Duplicate", email, password, businessName: "Dupe", industryKey: "plumbing", region: "CA",
      });
      if (duplicate.ok) {
        fail("duplicate email", "a second account with the same email was created");
      } else {
        pass("duplicate email", `refused (${duplicate.error})`);
      }
    }
  } finally {
    // ── Cleanup: remove only this verification tenant ──────
    if (workspaceId) {
      const scoped = await sql<{ table_name: string }[]>`
        SELECT table_name FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name = 'workspace_id'`;
      for (const { table_name } of scoped) {
        if (table_name === "workspace") continue;
        await sql`DELETE FROM ${sql(table_name)} WHERE workspace_id = ${workspaceId}`;
      }
      await sql`DELETE FROM workspace WHERE id = ${workspaceId}`;
      if (organizationId) {
        await sql`DELETE FROM organization WHERE id = ${organizationId}`;
      }
      const leftover = await sql<{ id: string }[]>`
        SELECT id FROM app_user WHERE email = ${email}`;
      if (leftover.length > 0) {
        fail("cleanup", `${leftover.length} app_user row(s) survived deletion`);
      } else {
        console.log(`  PASS  cleanup — verification tenant ${workspaceId} removed`);
      }
    }
    await sql.end({ timeout: 5 });
  }

  console.log(
    failures === 0
      ? "\n[verify] ALL CHECKS PASSED — the database path is real and working.\n"
      : `\n[verify] ${failures} CHECK(S) FAILED.\n`,
  );
  if (failures > 0) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("\n[verify] Failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
