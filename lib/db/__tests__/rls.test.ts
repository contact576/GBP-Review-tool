import { describe, it, expect, afterEach, vi } from "vitest";

import {
  SCHEMA_STATEMENTS,
  ADDITIVE_STATEMENTS,
  TENANT_SCOPED_TABLES,
  UNSCOPED_TABLES,
  RLS_POLICY_STATEMENTS,
  RLS_FORCE_STATEMENTS,
  RLS_UNFORCE_STATEMENTS,
  RLS_DROP_BYPASS_STATEMENTS,
  RLS_DISABLE_STATEMENTS,
  RLS_STATUS_QUERY,
  RLS_CURRENT_ROLE_QUERY,
  RLS_SCOPE_GUC,
  RLS_BYPASS_GUC,
  RLS_TENANT_POLICY,
  RLS_BYPASS_POLICY,
  rlsTenantPredicate,
} from "../schema-sql";
import {
  RLS_FLAG_ENV,
  WorkspaceScopeError,
  isRlsEnabled,
  normalizeWorkspaceScope,
  workspaceScopeStatement,
  bypassScopeStatement,
  planScopedStatements,
  runInWorkspaceScope,
  runWithRlsBypass,
  type ScopedStatement,
} from "../rls";
import type { FoundlySql } from "../client";

/**
 * These tests run with NO database. The production Neon instance is live and a
 * wrong policy silently returns zero rows, so everything here is asserted
 * against the generated SQL strings and the helper's pure behaviour instead.
 *
 * What that means honestly: these tests prove the SQL is well-formed,
 * fail-closed by construction, idempotent in shape, and additive-only, and that
 * the feature flag defaults to off. They do NOT prove Postgres accepts the DDL
 * or that isolation actually holds — only applying it to a staging database
 * proves that (rollout step 4 in lib/db/schema-sql.ts).
 */

// ── helpers ────────────────────────────────────────────────────────────────

/** Strip single-quoted SQL string literals so structural checks ignore them. */
function stripStringLiterals(sql: string): string {
  return sql.replace(/'(?:[^']|'')*'/g, "''");
}

function countUnquoted(sql: string, char: string): number {
  const stripped = stripStringLiterals(sql);
  let n = 0;
  for (const c of stripped) if (c === char) n += 1;
  return n;
}

/** Table names that carry a `workspace_id` column, parsed from the real DDL. */
function tablesWithWorkspaceIdColumn(): Set<string> {
  const found = new Set<string>();
  for (const stmt of [...SCHEMA_STATEMENTS, ...ADDITIVE_STATEMENTS]) {
    const match = /^CREATE TABLE IF NOT EXISTS "([a-z_]+)" \(([\s\S]*)\);$/.exec(
      stmt.trim(),
    );
    if (!match) continue;
    const table = match[1];
    const body = match[2];
    if (table && body && /"workspace_id"/.test(body)) found.add(table);
  }
  return found;
}

/** All table names declared by the schema DDL. */
function allDeclaredTables(): Set<string> {
  const found = new Set<string>();
  for (const stmt of [...SCHEMA_STATEMENTS, ...ADDITIVE_STATEMENTS]) {
    const match = /^CREATE TABLE IF NOT EXISTS "([a-z_]+)"/.exec(stmt.trim());
    const table = match?.[1];
    if (table) found.add(table);
  }
  return found;
}

/** Indexed access that fails loudly instead of tripping noUncheckedIndexedAccess. */
function at<T>(items: readonly T[], index: number): T {
  const value = items[index];
  if (value === undefined) {
    throw new Error(`Expected an element at index ${index}, found none.`);
  }
  return value;
}

const tenantTableNames = TENANT_SCOPED_TABLES.map((t) => t.table);

afterEach(() => {
  vi.unstubAllEnvs();
});

// ── 1. the flag defaults to OFF ────────────────────────────────────────────

describe("FOUNDLY_ENABLE_RLS defaults to off", () => {
  it("is off when the variable is absent", () => {
    expect(isRlsEnabled({})).toBe(false);
  });

  it("is off for every falsy / unset-ish spelling", () => {
    for (const value of ["", " ", "0", "false", "off", "no", "disabled"]) {
      expect(isRlsEnabled({ [RLS_FLAG_ENV]: value })).toBe(false);
    }
  });

  it("is off for a typo rather than failing open", () => {
    expect(isRlsEnabled({ [RLS_FLAG_ENV]: "ture" })).toBe(false);
    expect(isRlsEnabled({ [RLS_FLAG_ENV]: "1 " })).toBe(true); // trimmed
    expect(isRlsEnabled({ [RLS_FLAG_ENV]: "truthy" })).toBe(false);
  });

  it("is on only for explicit opt-in values", () => {
    for (const value of ["1", "true", "TRUE", "on", "yes", "Enabled"]) {
      expect(isRlsEnabled({ [RLS_FLAG_ENV]: value })).toBe(true);
    }
  });

  it("reads process.env by default, which is unset in this suite", () => {
    expect(process.env[RLS_FLAG_ENV]).toBeUndefined();
    expect(isRlsEnabled()).toBe(false);
  });
});

// ── 2. flag off must be byte-identical to today ────────────────────────────

describe("with the flag off the statement stream is unchanged", () => {
  const work: ScopedStatement[] = [
    { text: 'SELECT * FROM "customer" WHERE "workspace_id" = $1', values: ["ws_a"] },
    { text: 'SELECT * FROM "review"' },
  ];

  it("returns the caller's statements untouched", () => {
    const planned = planScopedStatements(["ws_a"], work, {});
    expect(planned).toEqual(work);
    expect(planned).toHaveLength(work.length);
    expect(planned.some((s) => s.text.includes("set_config"))).toBe(false);
  });

  it("prepends exactly one set_config when the flag is on", () => {
    const planned = planScopedStatements(["ws_a"], work, {
      [RLS_FLAG_ENV]: "1",
    });
    expect(planned).toHaveLength(work.length + 1);
    expect(at(planned, 0).text).toBe("SELECT set_config($1, $2, true)");
    expect(at(planned, 0).values).toEqual([RLS_SCOPE_GUC, "ws_a"]);
    expect(planned.slice(1)).toEqual(work);
  });

  it("still validates the scope while off, so bugs surface before enforcement", () => {
    expect(() => planScopedStatements([], work, {})).toThrow(WorkspaceScopeError);
    expect(() => planScopedStatements(["bad,id"], work, {})).toThrow(
      WorkspaceScopeError,
    );
  });
});

// ── 3. scope validation fails closed ───────────────────────────────────────

describe("normalizeWorkspaceScope", () => {
  it("rejects an empty scope instead of silently meaning 'see nothing'", () => {
    expect(() => normalizeWorkspaceScope([])).toThrow(WorkspaceScopeError);
  });

  it("rejects an id containing a comma (would widen the tenant scope)", () => {
    expect(() => normalizeWorkspaceScope(["ws_a,ws_b"])).toThrow(
      /comma or whitespace/,
    );
  });

  it("rejects whitespace, which the policy does not trim", () => {
    for (const bad of ["ws_a ", " ws_a", "ws a", "ws\ta", "ws\na"]) {
      expect(() => normalizeWorkspaceScope([bad])).toThrow(WorkspaceScopeError);
    }
  });

  it("rejects empty, over-long and control-character ids", () => {
    expect(() => normalizeWorkspaceScope([""])).toThrow(/must not be empty/);
    expect(() => normalizeWorkspaceScope(["w".repeat(201)])).toThrow(
      /implausibly long/,
    );
    expect(() => normalizeWorkspaceScope(["ws_\u0001a"])).toThrow(
      /control characters/,
    );
  });

  it("joins with a bare comma, matching the policy's string_to_array split", () => {
    expect(normalizeWorkspaceScope(["ws_a", "ws_b"])).toBe("ws_a,ws_b");
  });

  it("de-duplicates while preserving order", () => {
    expect(normalizeWorkspaceScope(["ws_b", "ws_a", "ws_b"])).toBe("ws_b,ws_a");
  });

  it("accepts the app's real id shape (prefix + nanoid alphabet)", () => {
    expect(normalizeWorkspaceScope(["ws_harbourview", "ws_V1StGXR8_Z5j-dHi"])).toBe(
      "ws_harbourview,ws_V1StGXR8_Z5j-dHi",
    );
  });
});

// ── 4. the GUC statements ──────────────────────────────────────────────────

describe("scope statements", () => {
  it("passes the tenant ids as bind parameters, never as SQL text", () => {
    const stmt = workspaceScopeStatement(["ws_a"]);
    expect(stmt.text).toBe("SELECT set_config($1, $2, true)");
    expect(stmt.text).not.toContain("ws_a");
    expect(stmt.values).toEqual([RLS_SCOPE_GUC, "ws_a"]);
  });

  it("uses is_local = true so the setting dies with the transaction", () => {
    expect(workspaceScopeStatement(["ws_a"]).text).toMatch(/,\s*true\)$/);
    expect(bypassScopeStatement().text).toMatch(/,\s*true\)$/);
  });

  it("the bypass statement targets the bypass GUC", () => {
    expect(bypassScopeStatement().values).toEqual([RLS_BYPASS_GUC, "on"]);
  });
});

// ── 5. runInWorkspaceScope wiring ──────────────────────────────────────────

interface FakeSql {
  sql: FoundlySql;
  submitted: { text: string; values: unknown[] }[][];
}

function makeFakeSql(): FakeSql {
  const submitted: { text: string; values: unknown[] }[][] = [];
  const query = (text: string, values?: unknown[]) => ({
    text,
    values: values ?? [],
  });
  const fn = query as unknown as FoundlySql;
  (fn as unknown as { transaction: unknown }).transaction = (
    queries: { text: string; values: unknown[] }[],
  ) => {
    submitted.push(queries);
    return Promise.resolve(queries.map((q) => [{ marker: q.text }]));
  };
  return { sql: fn, submitted };
}

describe("runInWorkspaceScope", () => {
  const work: ScopedStatement[] = [
    { text: "SELECT 1", values: [] },
    { text: "SELECT 2", values: [] },
  ];

  it("submits everything as ONE transaction (the only place SET LOCAL survives)", async () => {
    vi.stubEnv(RLS_FLAG_ENV, "1");
    const { sql, submitted } = makeFakeSql();
    await runInWorkspaceScope(sql, ["ws_a"], work);
    expect(submitted).toHaveLength(1);
    const batch = at(submitted, 0);
    expect(batch).toHaveLength(3);
    expect(at(batch, 0).text).toBe("SELECT set_config($1, $2, true)");
    expect(at(batch, 0).values).toEqual([RLS_SCOPE_GUC, "ws_a"]);
  });

  it("sets the scope FIRST, before any tenant query", async () => {
    vi.stubEnv(RLS_FLAG_ENV, "true");
    const { sql, submitted } = makeFakeSql();
    await runInWorkspaceScope(sql, ["ws_a", "ws_b"], work);
    const batch = at(submitted, 0);
    const texts = batch.map((q) => q.text);
    expect(texts.indexOf("SELECT set_config($1, $2, true)")).toBe(0);
    expect(at(at(batch, 0).values, 1)).toBe("ws_a,ws_b");
  });

  it("strips the scope result so callers index by their own statements", async () => {
    vi.stubEnv(RLS_FLAG_ENV, "1");
    const { sql } = makeFakeSql();
    const results = await runInWorkspaceScope(sql, ["ws_a"], work);
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual([{ marker: "SELECT 1" }]);
    expect(results[1]).toEqual([{ marker: "SELECT 2" }]);
  });

  it("returns the same shape with the flag off, and sends no set_config", async () => {
    const { sql, submitted } = makeFakeSql();
    const results = await runInWorkspaceScope(sql, ["ws_a"], work);
    const batch = at(submitted, 0);
    expect(batch).toHaveLength(2);
    expect(batch.some((q) => q.text.includes("set_config"))).toBe(false);
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual([{ marker: "SELECT 1" }]);
  });

  it("refuses to run at all without a workspace scope", async () => {
    const { sql, submitted } = makeFakeSql();
    await expect(runInWorkspaceScope(sql, [], work)).rejects.toThrow(
      WorkspaceScopeError,
    );
    expect(submitted).toHaveLength(0);
  });

  it("runWithRlsBypass opts into the bypass GUC only when the flag is on", async () => {
    const off = makeFakeSql();
    await runWithRlsBypass(off.sql, work);
    expect(off.submitted[0]).toHaveLength(2);

    vi.stubEnv(RLS_FLAG_ENV, "1");
    const on = makeFakeSql();
    const results = await runWithRlsBypass(on.sql, work);
    const batch = at(on.submitted, 0);
    expect(batch).toHaveLength(3);
    expect(at(batch, 0).values).toEqual([RLS_BYPASS_GUC, "on"]);
    expect(results).toHaveLength(2);
  });
});

// ── 6. the table list must not drift from the schema ───────────────────────

describe("TENANT_SCOPED_TABLES tracks the schema", () => {
  it("covers every table that declares a workspace_id column", () => {
    const fromSchema = tablesWithWorkspaceIdColumn();
    const covered = new Set(
      TENANT_SCOPED_TABLES.filter((t) => t.tenantColumn === "workspace_id").map(
        (t) => t.table,
      ),
    );
    const missing = [...fromSchema].filter((t) => !covered.has(t)).sort();
    expect(
      missing,
      `These tables carry workspace_id but have NO row-level-security policy, ` +
        `so they would leak across tenants. Add them to TENANT_SCOPED_TABLES.`,
    ).toEqual([]);
  });

  it("does not reference tables the schema never creates", () => {
    const declared = allDeclaredTables();
    const unknown = tenantTableNames.filter((t) => !declared.has(t)).sort();
    expect(unknown).toEqual([]);
  });

  it("scopes the workspace root by its own primary key", () => {
    const ws = TENANT_SCOPED_TABLES.find((t) => t.table === "workspace");
    expect(ws).toBeDefined();
    expect(ws?.tenantColumn).toBe("id");
    // The workspace table genuinely has no workspace_id column.
    expect(tablesWithWorkspaceIdColumn().has("workspace")).toBe(false);
  });

  it("lists no table twice", () => {
    expect(new Set(tenantTableNames).size).toBe(tenantTableNames.length);
  });

  it("accounts for every declared table as either scoped or explicitly unscoped", () => {
    const declared = allDeclaredTables();
    const scoped = new Set(tenantTableNames);
    const excused = new Set(UNSCOPED_TABLES.map((t) => t.table));
    const unaccounted = [...declared]
      .filter((t) => !scoped.has(t) && !excused.has(t))
      .sort();
    expect(
      unaccounted,
      "Every table must be either tenant-scoped or listed in UNSCOPED_TABLES " +
        "with a documented reason. Silence is how a leak hides.",
    ).toEqual([]);
  });

  it("documents password_reset_token as genuinely unscoped", () => {
    const entry = UNSCOPED_TABLES.find((t) => t.table === "password_reset_token");
    expect(entry).toBeDefined();
    expect(entry?.reason).toMatch(/workspace_id/);
    expect(tablesWithWorkspaceIdColumn().has("password_reset_token")).toBe(false);
  });
});

// ── 7. the policy SQL is well-formed ───────────────────────────────────────

describe("RLS_POLICY_STATEMENTS", () => {
  it("emits exactly one statement per tenant-scoped table", () => {
    expect(RLS_POLICY_STATEMENTS).toHaveLength(TENANT_SCOPED_TABLES.length);
  });

  it.each(TENANT_SCOPED_TABLES.map((t, i) => [t.table, t.tenantColumn, i] as const))(
    "%s: policy is complete and uses the %s column",
    (table, tenantColumn, index) => {
      const stmt = at(RLS_POLICY_STATEMENTS, index);

      expect(stmt).toContain(`public."${table}"`);
      expect(stmt).toContain(`ALTER TABLE public."${table}" ENABLE ROW LEVEL SECURITY;`);

      // Both policies created, each preceded by an idempotent drop.
      for (const policy of [RLS_TENANT_POLICY, RLS_BYPASS_POLICY]) {
        const drop = `DROP POLICY IF EXISTS "${policy}" ON public."${table}";`;
        const create = `CREATE POLICY "${policy}" ON public."${table}"`;
        expect(stmt).toContain(drop);
        expect(stmt).toContain(create);
        expect(stmt.indexOf(drop)).toBeLessThan(stmt.indexOf(create));
      }

      // FOR ALL + both USING and WITH CHECK, so INSERT/UPDATE are checked too.
      expect(stmt.match(/FOR ALL/g)).toHaveLength(2);
      expect(stmt.match(/USING \(/g)).toHaveLength(2);
      expect(stmt.match(/WITH CHECK \(/g)).toHaveLength(2);

      // The tenant predicate references the right column.
      expect(stmt).toContain(rlsTenantPredicate(tenantColumn));
    },
  );

  it.each(RLS_POLICY_STATEMENTS.map((s, i) => [tenantTableNames[i], s] as const))(
    "%s: dollar-quoting and parentheses balance",
    (_table, stmt) => {
      expect(stmt.match(/\$foundly_rls\$/g)).toHaveLength(2);
      expect(stmt.startsWith("DO $foundly_rls$")).toBe(true);
      expect(stmt.trimEnd().endsWith("$foundly_rls$;")).toBe(true);
      expect(countUnquoted(stmt, "(")).toBe(countUnquoted(stmt, ")"));
      // Single quotes pair up.
      expect(stripStringLiterals(stmt).includes("'''")).toBe(false);
    },
  );

  it.each(RLS_POLICY_STATEMENTS.map((s, i) => [tenantTableNames[i], s] as const))(
    "%s: skips the table when it does not exist yet",
    (table, stmt) => {
      expect(stmt).toContain(`IF to_regclass('public."${table}"') IS NULL THEN`);
      expect(stmt).toContain("RETURN;");
    },
  );

  it("uses the fail-closed form of current_setting (missing_ok = true)", () => {
    for (const stmt of RLS_POLICY_STATEMENTS) {
      expect(stmt).toContain(`current_setting('${RLS_SCOPE_GUC}', true)`);
      // A bare current_setting('app.workspace_ids') would ERROR when unset.
      expect(stmt).not.toMatch(
        new RegExp(`current_setting\\('${RLS_SCOPE_GUC}'\\)`),
      );
    }
  });

  it("splits the GUC on a bare comma, matching normalizeWorkspaceScope", () => {
    // Pinned in full: this single expression IS the tenant boundary. If it
    // changes, someone must look at it deliberately.
    expect(rlsTenantPredicate("workspace_id")).toBe(
      `"workspace_id" = ANY (string_to_array(current_setting('app.workspace_ids', true), ','))`,
    );
    expect(rlsTenantPredicate("id")).toBe(
      `"id" = ANY (string_to_array(current_setting('app.workspace_ids', true), ','))`,
    );
  });
});

// ── 8. additive-only: nothing here can destroy data ────────────────────────

describe("the DDL is additive and non-destructive", () => {
  const forbidden = [
    /\bDROP\s+TABLE\b/i,
    /\bDROP\s+COLUMN\b/i,
    /\bALTER\s+COLUMN\b/i,
    /\bRENAME\b/i,
    /\bTRUNCATE\b/i,
    /\bDELETE\s+FROM\b/i,
    /\bUPDATE\s+\w/i,
    /\bDROP\s+DATABASE\b/i,
    /\bDROP\s+SCHEMA\b/i,
    /\bCREATE\s+ROLE\b/i,
    /\bALTER\s+ROLE\b/i,
  ];

  const allGroups: [string, readonly string[]][] = [
    ["RLS_POLICY_STATEMENTS", RLS_POLICY_STATEMENTS],
    ["RLS_FORCE_STATEMENTS", RLS_FORCE_STATEMENTS],
    ["RLS_UNFORCE_STATEMENTS", RLS_UNFORCE_STATEMENTS],
    ["RLS_DROP_BYPASS_STATEMENTS", RLS_DROP_BYPASS_STATEMENTS],
    ["RLS_DISABLE_STATEMENTS", RLS_DISABLE_STATEMENTS],
  ];

  it.each(allGroups)("%s touches no table or column definition", (_name, group) => {
    for (const stmt of group) {
      for (const pattern of forbidden) {
        expect(pattern.test(stmt), `${pattern} matched:\n${stmt}`).toBe(false);
      }
    }
  });

  it.each(allGroups)("%s only ever drops policies", (_name, group) => {
    for (const stmt of group) {
      for (const match of stmt.match(/\bDROP\s+\w+/gi) ?? []) {
        expect(match.replace(/\s+/g, " ").toUpperCase()).toBe("DROP POLICY");
      }
    }
  });

  it.each(allGroups)("%s covers every tenant table exactly once", (_name, group) => {
    expect(group).toHaveLength(TENANT_SCOPED_TABLES.length);
    for (const [i, table] of tenantTableNames.entries()) {
      expect(group[i]).toContain(`public."${table}"`);
    }
  });

  it.each(allGroups)("%s is shaped to be re-runnable", (_name, group) => {
    for (const stmt of group) {
      // Guarded against a missing table...
      expect(stmt).toContain("IS NULL THEN");
      // ...and any DROP is IF EXISTS.
      for (const drop of stmt.match(/DROP POLICY[^;]*/g) ?? []) {
        expect(drop).toContain("IF EXISTS");
      }
    }
  });
});

// ── 9. the staged rollback statements do what they claim ───────────────────

describe("rollout stages", () => {
  it("stage 1 never enforces — no FORCE in the policy statements", () => {
    for (const stmt of RLS_POLICY_STATEMENTS) {
      expect(stmt).not.toMatch(/FORCE ROW LEVEL SECURITY/);
    }
  });

  it("stage 2 is the only thing that turns enforcement on", () => {
    for (const stmt of RLS_FORCE_STATEMENTS) {
      expect(stmt).toMatch(/ALTER TABLE public\."\w+" FORCE ROW LEVEL SECURITY;/);
      expect(stmt).not.toMatch(/NO FORCE/);
    }
  });

  it("the unforce rollback only lifts enforcement, keeping policies", () => {
    for (const stmt of RLS_UNFORCE_STATEMENTS) {
      expect(stmt).toContain("NO FORCE ROW LEVEL SECURITY;");
      expect(stmt).not.toContain("DISABLE ROW LEVEL SECURITY");
      expect(stmt).not.toContain("DROP POLICY");
    }
  });

  it("stage 5 removes only the bypass policy, never the real one", () => {
    for (const stmt of RLS_DROP_BYPASS_STATEMENTS) {
      expect(stmt).toContain(`DROP POLICY IF EXISTS "${RLS_BYPASS_POLICY}"`);
      expect(stmt).not.toContain(RLS_TENANT_POLICY);
    }
  });

  it("the panic rollback returns to today's behaviour completely", () => {
    for (const stmt of RLS_DISABLE_STATEMENTS) {
      expect(stmt).toContain("NO FORCE ROW LEVEL SECURITY;");
      expect(stmt).toContain("DISABLE ROW LEVEL SECURITY;");
      expect(stmt).toContain(`DROP POLICY IF EXISTS "${RLS_TENANT_POLICY}"`);
      expect(stmt).toContain(`DROP POLICY IF EXISTS "${RLS_BYPASS_POLICY}"`);
      // Order matters: stop forcing before dropping the policy, so there is
      // never an instant where RLS is enforced with no policy at all.
      expect(stmt.indexOf("NO FORCE")).toBeLessThan(stmt.indexOf("DROP POLICY"));
    }
  });
});

// ── 10. the read-only verification queries ─────────────────────────────────

describe("verification queries", () => {
  it("are read-only", () => {
    for (const q of [RLS_STATUS_QUERY, RLS_CURRENT_ROLE_QUERY]) {
      expect(q.trim().toUpperCase().startsWith("SELECT")).toBe(true);
      expect(q).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\b/i);
      expect(countUnquoted(q, "(")).toBe(countUnquoted(q, ")"));
    }
  });

  it("surface the three facts the rollout depends on", () => {
    expect(RLS_STATUS_QUERY).toContain("relrowsecurity");
    expect(RLS_STATUS_QUERY).toContain("relforcerowsecurity");
    expect(RLS_STATUS_QUERY).toContain("pg_get_userbyid(c.relowner)");
    expect(RLS_STATUS_QUERY).toContain(RLS_TENANT_POLICY);
    expect(RLS_STATUS_QUERY).toContain(RLS_BYPASS_POLICY);
    // Ownership/BYPASSRLS is why stage 1 is inert — the rollout must check it.
    expect(RLS_CURRENT_ROLE_QUERY).toContain("rolbypassrls");
    expect(RLS_CURRENT_ROLE_QUERY).toContain("rolsuper");
  });
});
