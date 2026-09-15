import {
  RLS_BYPASS_GUC,
  RLS_CURRENT_ROLE_QUERY,
  RLS_SCOPE_GUC,
  RLS_STATUS_QUERY,
} from "./schema-sql";
import type { FoundlySql } from "./client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TENANT SCOPE FOR ROW LEVEL SECURITY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The policies in lib/db/schema-sql.ts restrict every tenant-scoped table to
 * rows whose workspace id appears in the per-connection GUC `app.workspace_ids`.
 * This module is the *only* supported way to put a value in that GUC.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ⚠ READ THIS FIRST: THE NEON HTTP DRIVER CANNOT CARRY A SESSION GUC
 * ───────────────────────────────────────────────────────────────────────────
 * lib/db/client.ts builds the client with `neon()` from @neondatabase/serverless
 * (v0.10.x) and `drizzle-orm/neon-http`. That driver is STATELESS PER STATEMENT:
 * every query is an independent HTTPS request that the Neon proxy may serve on
 * a different backend connection. There is no session to hold anything.
 *
 * Consequences, verified against the installed packages:
 *
 *   1. A bare `SET`/`SET LOCAL` sent as its own statement is USELESS. It either
 *      lands on a connection that the next query never sees, or (for SET LOCAL)
 *      is discarded when its implicit transaction commits. It will not error —
 *      it will silently do nothing, and the next query returns ZERO ROWS once
 *      enforcement is on. This is the most likely way to get this wrong.
 *
 *   2. `drizzle(neon(...)).transaction(cb)` THROWS. Confirmed in
 *      node_modules/drizzle-orm/neon-http/session.js — the method body is
 *      `throw new Error("No transactions support in neon-http driver")`.
 *      Interactive transactions are simply not available.
 *
 *   3. What DOES work: the raw Neon client's `sql.transaction([...])`, which
 *      submits an array of statements as ONE non-interactive Postgres
 *      transaction in ONE HTTP request. `SET LOCAL` / `set_config(..., true)`
 *      as the first statement therefore applies to every later statement in the
 *      array. Drizzle's `db.batch([...])` is built on exactly this call
 *      (neon-http/session.js -> `this.client.transaction(builtQueries, ...)`),
 *      so it works too.
 *
 *      The catch is that it is NON-INTERACTIVE: the whole statement list must be
 *      known up front. You cannot read a row and then decide the next query.
 *      Most of lib/data/drizzle-provider.ts is written as sequential awaits and
 *      does not fit this shape without restructuring.
 *
 * SO: what must change before RLS can actually be enforced app-wide? One of —
 *
 *   (a) SWITCH DRIVER (recommended). Use `Pool` from @neondatabase/serverless
 *       (the WebSocket driver) with `drizzle-orm/neon-serverless`, which
 *       supports real interactive transactions over a single connection. Then
 *       `db.transaction(tx => { SET LOCAL ...; ...normal sequential code })`
 *       works and drizzle-provider.ts needs almost no restructuring. Costs a
 *       WebSocket connection per invocation and needs pool lifecycle care on
 *       serverless.
 *   (b) RESTRUCTURE CALLERS to batch each unit of work into a single
 *       `runInWorkspaceScope(...)` / `db.batch(...)` call. No driver change, but
 *       it is a large rewrite of the provider and impossible for genuinely
 *       sequential reads.
 *   (c) CONNECTION-STRING GUC: a separate `neon()` client per workspace whose
 *       URL carries `options=-c app.workspace_ids%3D<id>`. Avoid — it defeats
 *       client caching, leaks tenant ids into connection strings and logs, and
 *       relies on proxy behaviour that is not part of Neon's documented API.
 *
 * This module deliberately does NOT change the driver. It provides the correct
 * primitive for path (b) today and the exact statement that path (a) will need.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * HOW A CALLER MUST USE THIS
 * ───────────────────────────────────────────────────────────────────────────
 * A "unit of work" is one request's worth of database access for one tenant.
 * Wrap it, and never issue a tenant query outside a wrapper:
 *
 *     import { getSql } from "@/lib/db/client";
 *     import { runInWorkspaceScope } from "@/lib/db/rls";
 *
 *     const [customers, reviews] = await runInWorkspaceScope(
 *       getSql(),
 *       [session.workspaceId],
 *       [
 *         { text: 'SELECT * FROM "customer" WHERE "location_id" = $1', values: [locId] },
 *         { text: 'SELECT * FROM "review" WHERE "location_id" = $1', values: [locId] },
 *       ],
 *     );
 *
 * Rules:
 *   - Pass the workspace ids from the *authenticated session*, never from user
 *     input, a query string, or a request body.
 *   - Pass more than one id only where the product genuinely grants it (an
 *     agency user holding several client workspaces). Passing a wide list
 *     re-creates the very leak this exists to prevent.
 *   - Keep the application's own `WHERE workspace_id = ...` predicates. RLS is a
 *     SECOND line of defence, not a replacement — belt and braces. Removing the
 *     application predicates would make a scope bug catastrophic instead of
 *     merely wrong.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ROLLOUT ORDER — see the full commentary in lib/db/schema-sql.ts. Short form:
 *   1. Apply RLS_POLICY_STATEMENTS      (policies exist, inert for table owner)
 *   2. Verify with RLS_STATUS_QUERY + RLS_CURRENT_ROLE_QUERY; app unchanged
 *   3. Set FOUNDLY_ENABLE_RLS=1         (this module starts emitting the GUC)
 *   4. Apply RLS_FORCE_STATEMENTS       (enforcement begins; verify isolation)
 *   5. Apply RLS_DROP_BYPASS_STATEMENTS (remove the bypass policy)
 * Rollback at any point: RLS_UNFORCE_STATEMENTS, or clear the flag.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Env var gating this module. DEFAULT OFF — absent means "behave as today". */
export const RLS_FLAG_ENV = "FOUNDLY_ENABLE_RLS";

export { RLS_SCOPE_GUC, RLS_BYPASS_GUC };

/** A parameterised statement to run inside a scoped unit of work. */
export interface ScopedStatement {
  readonly text: string;
  readonly values?: readonly unknown[];
}

/** Thrown when a workspace scope is missing or unsafe. Always fail closed. */
export class WorkspaceScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceScopeError";
  }
}

/**
 * Just the shape this module needs from the environment. Deliberately looser
 * than NodeJS.ProcessEnv so tests can pass a plain object literal and prove the
 * default-off behaviour without mutating global state.
 */
export type RlsEnv = Readonly<Record<string, string | undefined>>;

const TRUTHY = new Set(["1", "true", "on", "yes", "enabled"]);

/**
 * Is database-enforced tenant isolation opted in?
 *
 * DEFAULT IS FALSE. Only an explicit truthy value ("1", "true", "on", "yes",
 * "enabled", case-insensitive) turns it on; undefined, "", "0" and "false" are
 * all off. With it off this module emits no GUC and the application behaves
 * exactly as it does today.
 *
 * Note this flag governs whether the *application* participates. It does not by
 * itself enforce anything — enforcement starts when RLS_FORCE_STATEMENTS is
 * applied to the database (rollout step 4).
 */
export function isRlsEnabled(env: RlsEnv = process.env): boolean {
  const raw = env[RLS_FLAG_ENV];
  if (typeof raw !== "string") return false;
  return TRUTHY.has(raw.trim().toLowerCase());
}

/**
 * An id is rejected if it could widen the scope or corrupt the GUC.
 *
 * The GUC is split on a bare comma, so an id CONTAINING a comma would silently
 * turn one workspace into two — a privilege escalation, not a syntax error.
 * Whitespace is rejected because the policy does not trim list members, so a
 * padded id would silently match nothing (fail-closed, but confusing).
 * Control characters are rejected on principle.
 *
 * Values reach Postgres as bind parameters, so this is not about SQL injection.
 * It is about the comma being semantically significant.
 */
function assertSafeWorkspaceId(id: string): void {
  if (id.length === 0) {
    throw new WorkspaceScopeError("Workspace id must not be empty.");
  }
  if (id.length > 200) {
    throw new WorkspaceScopeError(
      `Workspace id is implausibly long (${id.length} chars); refusing to set scope.`,
    );
  }
  if (/[,\s]/.test(id)) {
    throw new WorkspaceScopeError(
      `Workspace id ${JSON.stringify(id)} contains a comma or whitespace. ` +
        "The app.workspace_ids GUC is comma-separated, so this could silently " +
        "widen the tenant scope.",
    );
  }
  if (/[\u0000-\u001f\u007f]/.test(id)) {
    throw new WorkspaceScopeError(
      "Workspace id contains control characters; refusing to set scope.",
    );
  }
}

/**
 * Validate and canonicalise workspace ids into the exact GUC string.
 *
 * Duplicates are removed and order is preserved. Throws rather than returning
 * an empty string for an empty list: an empty scope means "see nothing", and if
 * a caller wants that it must say so explicitly, not arrive there by accident.
 */
export function normalizeWorkspaceScope(
  workspaceIds: readonly string[],
): string {
  if (workspaceIds.length === 0) {
    throw new WorkspaceScopeError(
      "At least one workspace id is required. An empty scope makes every " +
        "tenant table return zero rows — pass the session's workspace id.",
    );
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of workspaceIds) {
    assertSafeWorkspaceId(id);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out.join(",");
}

/**
 * The statement that sets the tenant scope for the rest of a transaction.
 *
 * `set_config(name, value, is_local => true)` is the function form of
 * `SET LOCAL`. It is used instead of literal `SET LOCAL` because a GUC value
 * cannot be a bind parameter in the `SET` syntax, and we refuse to interpolate
 * tenant ids into SQL text.
 *
 * ONLY MEANINGFUL INSIDE AN EXPLICIT TRANSACTION. On its own, over the HTTP
 * driver, it silently does nothing. See the driver note at the top of the file.
 */
export function workspaceScopeStatement(
  workspaceIds: readonly string[],
): ScopedStatement {
  return {
    text: "SELECT set_config($1, $2, true)",
    values: [RLS_SCOPE_GUC, normalizeWorkspaceScope(workspaceIds)],
  };
}

/**
 * The statement that activates the REMOVABLE bypass policy for a transaction.
 *
 * For migrations, seeding and platform-admin maintenance only. It is not a
 * security boundary — anyone able to run SQL can set this GUC — and rollout
 * step 5 deletes the policy it depends on, after which this becomes a no-op and
 * such work must run as a role with the BYPASSRLS attribute instead.
 */
export function bypassScopeStatement(): ScopedStatement {
  return {
    text: "SELECT set_config($1, $2, true)",
    values: [RLS_BYPASS_GUC, "on"],
  };
}

/**
 * Build the exact ordered statement list for a scoped unit of work.
 *
 * Pure and synchronous, so the flag behaviour is unit-testable with no database.
 *
 *  - flag OFF (default): returns `statements` unchanged. No GUC is set, nothing
 *    about the query stream differs from today.
 *  - flag ON: prepends the `set_config` scope statement.
 *
 * Validation runs in BOTH cases so that a bad workspace id is caught in staging
 * with the flag off, rather than first surfacing in production when it is on.
 */
export function planScopedStatements(
  workspaceIds: readonly string[],
  statements: readonly ScopedStatement[],
  env: RlsEnv = process.env,
): readonly ScopedStatement[] {
  const scope = workspaceScopeStatement(workspaceIds);
  if (!isRlsEnabled(env)) return statements;
  return [scope, ...statements];
}

/**
 * Run a unit of work with the tenant scope applied.
 *
 * Executes every statement as ONE non-interactive Postgres transaction in ONE
 * HTTP request via the raw Neon client's `transaction()`, which is the only
 * construct on this driver where `SET LOCAL` survives to the next statement.
 *
 * Returns one result-row array per statement in `statements` — the scope
 * statement's own result is stripped, so the returned array lines up with the
 * caller's input whether the flag is on or off.
 *
 * Because the transaction is non-interactive, all statements must be known up
 * front. Sequential read-then-decide logic needs the WebSocket driver instead;
 * see option (a) in the driver note above.
 */
export async function runInWorkspaceScope(
  sql: FoundlySql,
  workspaceIds: readonly string[],
  statements: readonly ScopedStatement[],
): Promise<unknown[][]> {
  const planned = planScopedStatements(workspaceIds, statements);
  if (planned.length === 0) return [];

  const results = await runInOneTransaction(sql, planned);

  const scopeStatementCount = planned.length - statements.length;
  return results.slice(scopeStatementCount);
}

/**
 * Run maintenance work with the bypass policy active (see bypassScopeStatement).
 * Only for migrations, seeding and platform-admin tasks. Never for a request
 * carrying an end user's session.
 */
export async function runWithRlsBypass(
  sql: FoundlySql,
  statements: readonly ScopedStatement[],
): Promise<unknown[][]> {
  if (statements.length === 0) return [];
  const planned = isRlsEnabled()
    ? [bypassScopeStatement(), ...statements]
    : statements;

  const results = await runInOneTransaction(sql, planned);

  return results.slice(planned.length - statements.length);
}

/**
 * Run every statement inside ONE transaction, in order.
 *
 * The transaction is not an optimization — it is what makes scoping work. The
 * scope statements this batches ahead of the caller's work use `SET LOCAL`,
 * whose effect is defined only within a transaction; run outside one, the
 * scope would silently evaporate and the following statements would execute
 * unscoped. So the statements must share a single connection and transaction,
 * which is exactly what `sql.begin` gives us.
 *
 * `unsafe` is required for parameterized raw SQL text under the postgres
 * driver: these statements are module-level constants, and every value the
 * caller supplies travels as a bound parameter, never interpolated.
 */
async function runInOneTransaction(
  sql: FoundlySql,
  planned: readonly ScopedStatement[],
): Promise<unknown[][]> {
  return (await sql.begin(async (tx) => {
    const out: unknown[][] = [];
    for (const statement of planned) {
      // `ScopedStatement.values` is intentionally `unknown[]` — callers bind
      // arbitrary column values. The driver's parameter type is narrower, so
      // the cast happens here, at the single boundary, rather than forcing
      // every caller to pre-narrow what is genuinely dynamic data.
      const values = [...(statement.values ?? [])] as Parameters<typeof tx.unsafe>[1];
      out.push((await tx.unsafe(statement.text, values)) as unknown[]);
    }
    return out;
  })) as unknown[][];
}

/** One row of RLS_STATUS_QUERY. */
export interface RlsTableStatus {
  table_name: string;
  rls_enabled: boolean;
  rls_forced: boolean;
  table_owner: string;
  policy_count: number;
  bypass_policy_count: number;
}

/** Result of RLS_CURRENT_ROLE_QUERY. */
export interface RlsRoleStatus {
  role_name: string;
  is_superuser: boolean;
  bypasses_rls: boolean;
}

/**
 * Read-only verification helper for rollout steps 2 and 4. Performs no writes
 * and is safe to call against production at any time.
 */
export async function readRlsStatus(sql: FoundlySql): Promise<{
  role: RlsRoleStatus | null;
  tables: RlsTableStatus[];
}> {
  const roleRows = (await sql.unsafe(RLS_CURRENT_ROLE_QUERY)) as unknown as RlsRoleStatus[];
  const tableRows = (await sql.unsafe(RLS_STATUS_QUERY)) as unknown as RlsTableStatus[];
  return { role: roleRows[0] ?? null, tables: tableRows };
}
