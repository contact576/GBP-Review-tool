import { timingSafeEqual } from "node:crypto";

export function isMonitoringCronAuthorized(authorization: string | null, configuredSecret: string | undefined): boolean {
  if (!configuredSecret || configuredSecret.length < 24 || !authorization?.startsWith("Bearer ")) return false;
  const supplied = authorization.slice("Bearer ".length);
  const expected = Buffer.from(configuredSecret);
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
