import type { Instrumentation } from "next";
import { logServerError } from "@/lib/observability/log";

export function register(): void {
  // Next.js invokes this once per server instance. Provider-specific tracing
  // can be registered here without changing application code.
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
