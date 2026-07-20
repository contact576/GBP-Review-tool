export interface ErrorEventContext {
  event: string;
  route?: string;
  method?: string;
  routeType?: string;
  digest?: string;
  [key: string]: string | number | boolean | undefined;
}

/** Structured, secret-free events that remain queryable in any host log drain. */
export function logServerError(error: unknown, context: ErrorEventContext): void {
  const normalized = error instanceof Error ? error : new Error(String(error));
  console.error(
    JSON.stringify({
      level: "error",
      service: "foundly",
      time: new Date().toISOString(),
      ...context,
      errorName: normalized.name,
      message: normalized.message.slice(0, 500),
    }),
  );
}
