/**
 * Centralized secret resolution (V11).
 *
 * The codebase ships development fallback constants for its signing/encryption
 * secrets so zero-config local demos work. Because the repo is public, those
 * fallbacks are known to everyone — a deployment that runs on one of them lets
 * anyone forge session JWTs, signed asset URLs, or referral codes.
 *
 * This resolver fails CLOSED on any real deployment: if the secret is absent it
 * throws whenever NODE_ENV is production OR the process is running on Vercel
 * (including preview deployments, which were the overlooked gap). The published
 * fallback is only ever used in explicit local development / test.
 */
export function resolveSecret(input: {
  value: string | undefined;
  name: string;
  devFallback: string;
}): string {
  if (input.value) return input.value;

  const isProduction = process.env.NODE_ENV === "production";
  const isVercel = process.env.VERCEL === "1"; // set on every Vercel env, incl. preview
  if (isProduction || isVercel) {
    throw new Error(
      `${input.name} is required on any deployed environment. Set it in your project's ` +
        `environment variables (production AND preview) — the development fallback must never ship.`,
    );
  }
  return input.devFallback;
}
