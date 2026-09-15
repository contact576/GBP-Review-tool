/**
 * The app's public origin, for absolute URLs (QR codes, OAuth redirects,
 * password-reset and invite links, webhook callbacks).
 *
 * SECURITY (V4): this value MUST NOT be derived from the incoming request's
 * Host / X-Forwarded-Host header. Those headers are attacker-controlled, and
 * this origin is used to build password-reset links — deriving it from the
 * request let an attacker send a victim a genuine reset email whose link points
 * at an attacker-controlled domain (account takeover). The header fallback has
 * been removed entirely.
 *
 * Resolution order — every source is operator- or platform-provided, never the
 * request:
 *   1. NEXT_PUBLIC_APP_URL / APP_URL  — explicit operator configuration
 *   2. VERCEL_PROJECT_PRODUCTION_URL  — Vercel-injected stable production host
 *   3. VERCEL_URL                     — Vercel-injected per-deployment host
 *                                       (safe: set by the platform, not the client)
 *   4. http://localhost:3000          — local development only
 */
export async function appUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (configured) return normalize(configured);

  const vercelProduction = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelProduction) return `https://${bareHost(vercelProduction)}`;

  const vercelDeployment = process.env.VERCEL_URL;
  if (vercelDeployment) return `https://${bareHost(vercelDeployment)}`;

  return "http://localhost:3000";
}

function normalize(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${bareHost(trimmed)}`;
}

function bareHost(value: string): string {
  return value.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}
