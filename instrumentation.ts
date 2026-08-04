import type { Instrumentation } from "next";
import { logServerError } from "@/lib/observability/log";

export function register(): void {
  // Next.js invokes this once per server instance. Provider-specific tracing
  // can be registered here without changing application code.
  //
  // Additive migrations must also run here. ensureSchema() was previously only
  // reachable from registerUser(), /setup and `npm run db:verify`, so a deploy
  // that added a column to ADDITIVE_STATEMENTS shipped queries selecting a
  // column the live database did not have — every read 500ed until somebody
  // happened to sign up. Booting the schema check makes the deploy self-healing.
  //
  // The import must sit INSIDE this literal check, not after an early return.
  // NEXT_RUNTIME is inlined at build time, so webpack can drop the branch — and
  // with it the Postgres driver — from the edge bundle. Hoisted out, the edge
  // compilation still follows the import and fails on `crypto`/`net`/`stream`.
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.DATABASE_URL) {
    void (async () => {
      try {
        const { ensureSchema } = await import("@/lib/db/ensure");
        const result = await ensureSchema();
        if (!result.ok) {
          logServerError(new Error(result.error ?? "ensureSchema failed"), { event: "schema_boot" });
        }
      } catch (error) {
        // Never block server start on a migration probe.
        logServerError(error, { event: "schema_boot" });
      }
    })();
  }
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  const digest =
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string"
      ? error.digest
      : undefined;
  logServerError(error, {
    event: "request_error",
    route: context.routePath || request.path,
    method: request.method,
    routeType: context.routeType,
    digest,
    router: context.routerKind,
  });
};
