import { headers } from "next/headers";

/**
 * The app's public origin, for absolute URLs (QR codes, OAuth redirects,
 * emails). Prefers NEXT_PUBLIC_APP_URL / APP_URL; falls back to the current
 * request's host so QR codes work on any deploy domain with zero config.
 */
export async function appUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) {
      const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
      return `${proto}://${host}`;
    }
  } catch {
    // headers() unavailable (build-time render) — fall through.
  }
  return "http://localhost:3000";
}
