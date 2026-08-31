/**
 * Google integration configuration — single source of truth for which
 * Google capabilities are unlocked by the current environment.
 *
 * Everything is optional: without credentials the app degrades honestly
 * (manual entry in onboarding, "not configured" states in settings, and the
 * free score tool declines to score rather than inventing one — it never
 * shows an estimated or synthetic result).
 *
 * Only read server-side (route handlers / server components). None of these
 * values are ever shipped to the client — pages pass booleans down as props.
 */

/** OAuth client ID (Google Cloud console → Credentials → OAuth 2.0 Client). */
export function googleClientId(): string {
  return process.env.GOOGLE_CLIENT_ID ?? "";
}

/** OAuth client secret paired with {@link googleClientId}. */
export function googleClientSecret(): string {
  return process.env.GOOGLE_CLIENT_SECRET ?? "";
}

/** API key with the Places API (New) enabled. */
export function googleMapsApiKey(): string {
  return process.env.GOOGLE_MAPS_API_KEY ?? "";
}

/** True when "Sign in with Google" and the GBP connect flow can run. */
export function googleSignInEnabled(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** True when real business lookup (Places Text Search) can run. */
export function placesEnabled(): boolean {
  return Boolean(process.env.GOOGLE_MAPS_API_KEY);
}

export function instagramAppId(): string {
  return process.env.META_INSTAGRAM_APP_ID ?? "";
}

export function instagramAppSecret(): string {
  return process.env.META_INSTAGRAM_APP_SECRET ?? "";
}

export function instagramOAuthEnabled(): boolean {
  return Boolean(process.env.META_INSTAGRAM_APP_ID && process.env.META_INSTAGRAM_APP_SECRET);
}
