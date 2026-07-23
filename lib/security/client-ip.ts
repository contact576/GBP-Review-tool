/**
 * Trusted client-IP derivation (V3).
 *
 * The app runs behind Vercel's proxy, which is the single trusted hop. The
 * previous logic trusted `cf-connecting-ip` first — a Cloudflare header Vercel
 * never sets, so it was entirely client-controlled — and then took the LEFT-most
 * `x-forwarded-for` entry, which a client can freely prepend. Either let an
 * attacker mint a fresh rate-limit bucket per request, defeating every IP-keyed
 * limit (login, registration, password reset, unauthenticated AI/Places cost).
 *
 * Correct sources on Vercel, in order:
 *   1. `x-real-ip`            — set by the platform to the true client IP
 *   2. right-most `x-forwarded-for` hop — the entry the platform appended
 *                              (client-prepended values sit to its left)
 *
 * `cf-connecting-ip` is intentionally NOT consulted.
 *
 * NOTE (V7): the buckets these identities key into still live in per-instance
 * memory. Moving them to a shared store (Upstash/Vercel KV) is the deferred
 * follow-up; this function fixes the identity-spoofing half of the problem.
 */
type HeaderGetter = (name: string) => string | null | undefined;

export function trustedClientIp(get: HeaderGetter): string {
  const realIp = get("x-real-ip");
  if (realIp && realIp.trim()) return realIp.trim();

  const forwarded = get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const platformHop = hops[hops.length - 1];
    if (platformHop) return platformHop;
  }

  return "unknown";
}
