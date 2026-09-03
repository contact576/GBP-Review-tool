# Foundly (GBP-Review-tool) — Security Review

**Branch:** `shrikaanth-update` (branched from `claude/build-complete-tool-vercel-lcodws`, the repo default)
**Commit reviewed:** `084eae3` — "Build commercial Foundly local growth platform"
**Date:** 2026-07-23
**Method:** Manual source review of the full application surface (auth, middleware, server actions, API routes, data providers, integrations) plus `npm audit`. No live/dynamic testing was performed — no deployment was targeted, so findings are code-level and preconditions are stated explicitly.

---

## 1. What this project is

**Foundly** is a commercial multi-tenant SaaS for local-business review growth, built around the loop:

> ASK → REVIEWS → OPTIMIZED PROFILE → VISIBILITY → NEW CUSTOMERS

A business owner connects their Google Business Profile; staff capture customers at point of service; the platform sends review requests by email/SMS; customers land on a hosted review flow; 4–5★ ratings are routed to the public Google review page and low ratings into private feedback. On top of that sit AI-generated profile content, rank-grid visibility scans, an agency console for managing client workspaces, Stripe billing, and an internal platform admin console.

### Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15.5.20 (App Router, React 19, TypeScript strict) |
| Styling | Tailwind CSS 3.4, custom design system in `components/ds` + `components/charts` |
| Database | Postgres via Neon serverless HTTP driver + Drizzle ORM 0.45 |
| Auth | Custom — `jose` HS256 JWT in an httpOnly cookie, `bcryptjs` password hashing |
| AI | Anthropic SDK (drafts/copy) + OpenAI (grounded content + image generation) |
| Integrations | Google OAuth · Places API (New) · Business Profile API · Search Console · Instagram Graph · Resend (email) · Twilio (SMS) · Stripe (billing) |
| Hosting | Vercel (`vercel.json` declares an hourly cron → `/api/cron/monitor`) |
| Testing | Vitest (unit) + Playwright (e2e, incl. `e2e/security.spec.ts`) |
| Size | ~48k LOC across 515 tracked files |

### Architecture notes relevant to security

- **Dual data provider.** `lib/data/index.ts` pivots between an in-memory provider (demo sessions, and the fallback when `DATABASE_URL` is unset) and the Drizzle/Postgres provider. Public token surfaces query *both* stores via `getPublicProviders()`.
- **Tenancy** is a `workspaceId` carried in the JWT. Every provider mutation I sampled correctly filters on `workspaceId` alongside the row id.
- **Authorization** happens in three places: `middleware.ts` (route prefix → role), `lib/actions.ts` `scoped()`/`requireRole()` (server actions), and `guardAuthenticatedApi()` (API routes).

### Things the codebase does well

Worth stating, because it shapes the severity of what follows:

- **No SQL injection.** Every query goes through Drizzle's parameterized builder or `sql` tagged templates. The raw-string `sql(statement)` calls in `lib/db/ensure.ts` execute a hardcoded DDL constant list only.
- **No XSS sinks.** Zero uses of `dangerouslySetInnerHTML` in the entire tree; all rendering goes through React's escaping.
- **Correct webhook verification.** Stripe (`lib/billing/stripe.ts:149`) does HMAC-SHA256 with a 300s timestamp tolerance and `timingSafeEqual`; Twilio (`lib/sms/twilio.ts:65`) does the canonical HMAC-SHA1 URL+params scheme, also constant-time.
- **Google ID tokens are properly verified** against Google's remote JWKS with issuer and audience pinning (`lib/google/oauth.ts:112`) — not merely decoded.
- **OAuth CSRF state** is random, httpOnly, short-TTL, and compared on every callback.
- **Refresh tokens are encrypted at rest** with AES-256-GCM in a versioned envelope (`lib/google/crypto.ts`).
- **Password reset tokens** are 32 random bytes, stored only as SHA-256 hashes, single-use via a conditional `UPDATE ... WHERE used_at IS NULL AND expires_at > now` claim, with a non-enumerating generic response.
- **Real SSRF hardening exists** in `lib/evidence/website.ts` — protocol/port/credential checks, DNS resolution with a private-range blocklist, manual redirect handling that re-validates each hop, size caps and timeouts. (It has one gap; see V6.)
- **Token entropy is fine** — `nanoid()` (~126 bits, CSPRNG-backed) for review/QR/invite tokens.
- **No secrets are committed** anywhere in the tree or git history.

---

## 2. Vulnerability summary

| # | Severity | Finding | Location |
|---|---|---|---|
| V1 | **High** | Unauthenticated server actions trigger billed API calls and production DDL | `app/(marketing)/setup/actions.ts` |
| V2 | **High** | Public `/setup` page discloses full deployment secret/config posture | `app/(marketing)/setup/page.tsx` |
| V3 | **High** | Rate limiting bypassable via spoofed client-IP headers | `lib/security/api.ts:20`, `lib/actions.ts:166` |
| V4 | **High** | Password-reset link poisoning via Host header (when `APP_URL` unset) | `lib/utils/app-url.ts:8` |
| V5 | **High** | Vulnerable dependencies — 8 Next.js advisories incl. Server Function disclosure | `package.json` |
| V6 | **High** | SSRF via DNS rebinding (TOCTOU) in the website evidence crawler | `lib/evidence/website.ts:126` |
| V7 | **Medium** | Rate-limit state is per-instance in-memory; ineffective on serverless | `lib/security/api.ts:11` |
| V8 | **Medium** | Sessions cannot be revoked — password reset does not evict an attacker | `lib/auth/jwt.ts`, `lib/auth/session.ts` |
| V9 | **Medium** | `/admin` console authorization exists only in middleware | `app/(admin)/layout.tsx:5` |
| V10 | **Medium** | No CSP or anti-framing on any public surface (review flow, widget, APIs) | `middleware.ts:60` |
| V11 | **Medium** | Hardcoded fallback secrets in a public repo; referral signer has no prod guard | `lib/auth/jwt.ts:18` + 3 others |
| V12 | **Medium** | Public "Google rating / review count" is client-writable and unvalidated | `lib/actions.ts:560` |
| V13 | **Low** | `script-src 'unsafe-inline'` in the CSP that does exist | `middleware.ts:32` |
| V14 | **Low** | Origin check fails open when the `Origin` header is absent | `lib/security/api.ts:29` |
| V15 | **Low** | Staff invite tokens are issued and emailed but never redeemable | `lib/actions.ts:1404` |
| V16 | **Low** | Anyone can mint a `platform_admin` session via the demo role picker | `lib/actions.ts:377` |
| V17 | **Low** | bcrypt cost 10; weak password policy; no email verification | `lib/auth/password.ts` |

---

## 3. Findings in detail

### V1 — Unauthenticated server actions cause billed API calls and touch the production database
**Severity: High** · CWE-306 (Missing Authentication for Critical Function), CWE-770 (Allocation Without Limits)
**File:** `app/(marketing)/setup/actions.ts`

All three exported server actions have **no session check, no role check, and no rate limit**:

```ts
"use server";

export async function initDbAction()   { return ensureSchema(); }        // runs DDL on prod Postgres
export async function testAiAction()   { /* live Anthropic completion */ }
export async function testPlacesAction(){ /* live Google Places search */ }
```

`/setup` lives in the `(marketing)` route group, which `middleware.ts`'s matcher does not cover — the page and its actions are fully public. Server actions are invokable by action ID from any origin; an attacker does not need to load the page.

**Impact.** `testAiAction` and `testPlacesAction` each make a real, billed provider call per invocation. A trivial loop drives unbounded Anthropic and Google Maps Platform spend, and can exhaust Places quota so the product's core business-lookup breaks for paying tenants. `initDbAction` reaches the production database on demand.

**Mitigating:** the DDL in `lib/db/schema-sql.ts` is exclusively `CREATE TABLE/INDEX IF NOT EXISTS` — nothing destructive — and `ensureSchema` short-circuits on a `globalThis` flag after the first success. So the DB impact is connection load, not data loss.

**Fix.** Require an authenticated `platform_admin` session (or the existing `HEALTH_CHECK_SECRET`) on all three, and add `consumeRateLimit` to the two provider probes. `/api/health?deep=1` already implements exactly this pattern (`app/api/health/route.ts:54`) — reuse it.

---

### V2 — Public setup page discloses the full deployment configuration posture
**Severity: High** · CWE-200 (Exposure of Sensitive Information)
**File:** `app/(marketing)/setup/page.tsx:16-42`

The unauthenticated `/setup` page renders a boolean for **every** security-relevant environment variable:

```ts
const authSecret         = Boolean(process.env.AUTH_SECRET);
const encSecret          = Boolean(process.env.ENCRYPTION_SECRET);
const assetSigningSecret = Boolean(process.env.CONTENT_ASSET_SIGNING_SECRET || process.env.AUTH_SECRET);
const cronSecret         = Boolean(process.env.CRON_SECRET && process.env.CRON_SECRET.length >= 24);
const appUrlSet          = Boolean(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL);
// ...plus Stripe, Twilio, Resend, Google, OpenAI, and DB reachability
```

It also calls `checkDatabase()`, which returns the raw driver error string on failure — typically leaking the database host and driver details.

No secret *values* are exposed. The problem is that this is a precision reconnaissance oracle: it tells an attacker exactly which of the other findings on this list are live. `appUrlSet: false` means V4 is exploitable. `authSecret: false` means V11 is exploitable. `cronSecret: false` means `/api/cron/monitor` is open.

**Fix.** Gate the page behind `platform_admin`, and never render the raw DB error to an unauthenticated viewer.

---

### V3 — Rate limiting is bypassable by spoofing client-IP headers
**Severity: High** · CWE-290 (Spoofing), CWE-807 (Untrusted Input in Security Decision)
**Files:** `lib/security/api.ts:20`, `lib/actions.ts:166`

Both identity functions trust request headers directly, with no trusted-proxy allowlist:

```ts
function requestIdentity(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||   // ← fully client-controlled unless behind Cloudflare
    req.headers.get("x-real-ip")      ||     // ← client-controlled
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}
```

The app is deployed on Vercel, not Cloudflare, so `cf-connecting-ip` is never set by infrastructure and is accepted verbatim from the caller. Sending a fresh random value per request yields a fresh rate-limit bucket every time.

**What this defeats:**

| Control | Location | Bypassed? |
|---|---|---|
| `auth-login-ip` — 100 sign-ins / 10 min | `lib/actions.ts:253` | Yes |
| `auth-register` — 30 sign-ups / 10 min | `lib/actions.ts:205` | Yes |
| `password-reset-request-ip` — 20 / hr | `lib/actions.ts:294` | Yes |
| `password-reset-consume-ip` — 30 / hr | `lib/actions.ts:348` | Yes |
| `review-progress` / `private-feedback` IP limits | `lib/actions.ts:184` | Yes |
| `ai-review-edit-ip` — 30 / min (unauthenticated, billed) | `app/api/ai/review-edit/route.ts` | Yes |
| `auth-login-email` — 10 / 10 min | `lib/actions.ts:252` | **No** — keyed on the email |

The per-email login limit is the one surviving brute-force control, and V7 weakens it. Everything else — including the guard on an unauthenticated endpoint that spends AI credits — is effectively unlimited.

**Fix.** Derive the client IP from the platform's trusted header only (on Vercel, the rightmost trustworthy hop of `x-forwarded-for`, or `request.ip`). Do not accept `cf-connecting-ip`/`x-real-ip` from arbitrary clients.

---

### V4 — Password-reset link poisoning via the Host header
**Severity: High** (conditional — see precondition) · CWE-640, CWE-601
**File:** `lib/utils/app-url.ts:8`

```ts
export async function appUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");   // ← attacker-controlled
  if (host) {
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  }
  return "http://localhost:3000";
}
```

**Precondition:** neither `NEXT_PUBLIC_APP_URL` nor `APP_URL` is set. The project explicitly supports this — `.env.example` comments both out, and the docstring calls the fallback a feature ("QR codes work on any deploy domain with zero config"). V2 lets an attacker confirm the precondition remotely.

**Attack.** `requestPasswordResetAction` (`lib/actions.ts:325`) builds the reset link from `appUrl()`:

```ts
const base = await appUrl();
const template = passwordResetEmail({ link: `${base}/reset-password?token=${encodeURIComponent(token)}` });
```

An attacker POSTs a reset request for `victim@example.com` with `X-Forwarded-Host: attacker.tld`. Foundly mails the victim a legitimate reset email — correct From address, correct template — whose link points at `https://attacker.tld/reset-password?token=<valid one-time token>`. One click hands over full account takeover of the tenant workspace.

**Same sink, other surfaces:** staff invite links (`lib/actions.ts:1422`), review-request links in email and SMS (`lib/actions.ts:131`, `:153`), the Twilio status-callback URL, and `createSignedContentAssetUrl`'s base.

**Fix.** Require `APP_URL`/`NEXT_PUBLIC_APP_URL` for any outbound link or callback URL; if you keep the header fallback for QR convenience, validate the host against an allowlist and never use it to build authentication links.

---

### V5 — Vulnerable dependencies
**Severity: High** · CWE-1395
**File:** `package.json` / `package-lock.json`

`npm audit --omit=dev` reports 3 production vulnerabilities (2 high, 1 moderate); the full audit reports 7.

**`next@15.5.20`** — 8 advisories, the most relevant being:

- **GHSA-955p-x3mx-jcvp** — Unauthenticated disclosure of internal Server Function endpoints. This directly amplifies **V1**: it makes the unauthenticated `initDbAction`/`testAiAction`/`testPlacesAction` action IDs discoverable rather than requiring them to be scraped from the page bundle.
- **GHSA-m99w-x7hq-7vfj** — Denial of Service in App Router via Server Actions.
- **GHSA-4c39-4ccg-62r3** — Unbounded Server Action payload in the Edge runtime. Note that `readJsonObject`'s size cap only protects API routes; server actions in `lib/actions.ts` accept arbitrarily large structured input.
- **GHSA-68g3-v927-f742** / **GHSA-4633-3j49-mh5q** — Cache confusion of response bodies for requests with bodies. Serious in a multi-tenant app: cross-tenant response mixing.
- **GHSA-p9j2-gv94-2wf4**, **GHSA-89xv-2m56-2m9x** — SSRF via rewrites / Server Actions.
- **GHSA-q8wf-6r8g-63ch** — DoS in the Image Optimization API via SVG.

**`sharp <0.35.0`** (high) — inherited libvips CVE-2026-33327/33328/35590/35591.
**`postcss <8.5.10`** (moderate) — XSS via unescaped `</style>` in stringify output.

Note the app is *newer* than the CVE-2025-29927 middleware-bypass fix (patched in 15.2.3), so V9 has no known live bypass today.

**Fix.** `npm audit fix` resolves all three production advisories. Add `npm audit --omit=dev --audit-level=high` to `.github/workflows/ci.yml`, which currently runs lint/typecheck/test/build but no dependency gate.

---

### V6 — SSRF via DNS rebinding in the website evidence crawler
**Severity: High** · CWE-918 (SSRF), CWE-367 (TOCTOU)
**File:** `lib/evidence/website.ts:126-170`

The SSRF defenses here are genuinely good, but the validation and the request resolve DNS **independently**:

```ts
async function assertPublicHttpUrl(value: string): Promise<URL> {
  const url = new URL(value);
  // ...protocol / port / credential / literal-IP checks...
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });   // ← resolution #1
  if (!addresses.length || addresses.some((e) => isBlockedIp(e.address))) throw ...;
  return url;                                                                    // ← returns the HOSTNAME
}

async function fetchWebsiteHtml(value: string) {
  let current = await assertPublicHttpUrl(value);
  const response = await fetch(current, { redirect: "manual", ... });            // ← resolution #2
```

`fetch()` re-resolves the hostname; nothing pins the address that passed validation. An attacker registers a domain with a 1-second TTL that answers with a public IP for the first lookup and `169.254.169.254` (cloud metadata) or an internal `10.x`/`172.16.x` address for the second. The `redirect: "manual"` loop revalidates each hop but has the identical gap on every one.

**Precondition:** an authenticated account that can set the workspace website URL. Sign-up is open and self-service, so this is a low bar. The crawler then fetches up to 5 pages, extracts title/headings/text/emails/phones, and persists them as workspace "evidence" — giving the attacker a **read-back channel** for the response body, not just a blind request.

**Related gap:** `isBlockedIp` (line 112) covers `0/8`, `10/8`, `127/8`, `169.254/16`, `172.16-31`, `192.168/16`, `100.64/10`, multicast, IPv6 loopback/link-local/ULA — but misses `192.0.0.0/24` and `198.18.0.0/15`.

**Fix.** Resolve once, validate the resulting addresses, and connect to the validated IP with the `Host` header preserved (a custom `lookup`/agent that pins the address, or an egress proxy with an allowlist). Then extend `isBlockedIp`.

---

### V7 — Rate-limit state is per-instance and in-memory
**Severity: Medium** · CWE-770
**File:** `lib/security/api.ts:11-18`

```ts
const runtimeState = globalThis as unknown as { __foundlyApiRateBuckets?: Map<string, RateBucket> };
```

Every counter in the app lives in one serverless instance's heap. The code comments acknowledge this ("Per-instance abuse protection… a durable distributed limiter can replace the store"), but the consequence is worth stating: on Vercel, effective limits are multiplied by the number of concurrently warm lambdas and reset entirely on cold start. Concurrent requests are load-balanced across instances, so a 10-per-10-minutes limit becomes 10 × N.

This is what makes V3 severe rather than academic — `auth-login-email` is the only bucket an attacker cannot bypass by spoofing headers, and V7 dilutes it.

**Fix.** Move buckets to Redis/Upstash or Vercel KV, keyed identically so route code is unchanged.

---

### V8 — Sessions cannot be revoked; password reset does not evict an attacker
**Severity: Medium** · CWE-613 (Insufficient Session Expiration)
**Files:** `lib/auth/jwt.ts`, `lib/auth/session.ts:60`

Sessions are stateless HS256 JWTs with a **30-day** TTL (`SESSION_TTL_SECONDS = 60*60*24*30`) and no `jti`, no session-version claim, and no server-side session table. `verifySession` checks the signature and role shape only.

Consequences:

- **`resetPasswordAction` does not invalidate existing sessions.** `consumePasswordResetToken` replaces the password hash; any token the attacker already holds stays valid for up to 30 more days. The standard "I've been compromised, change your password" remediation does not work.
- **`signOutAction` → `clearSession()` only deletes the cookie.** A token captured before sign-out remains valid until expiry.
- **`switchWorkspaceAction` re-mints a session** with a new `workspaceId` (`lib/actions.ts:1507`) — correctly gated by an organization-membership check, but the *old* token for the previous workspace also remains valid. Removing a location from an organization does not revoke access to it.

**Fix.** Add a `sessionVersion` (or `tokenVersion`) column on `app_user`, embed it as a claim, bump it on password reset and explicit sign-out, and verify it in `verifySession`. Consider shortening the TTL with a refresh mechanism.

---

### V9 — `/admin` console authorization exists only in middleware
**Severity: Medium** · CWE-1220 (Insufficient Granularity of Access Control)
**File:** `app/(admin)/layout.tsx:5`

```ts
export default async function AdminLayout({ children }) {
  const { session } = await getSessionAndData();     // authenticates; never inspects session.role
  return <>{session.isDemo ? <DemoBanner /> : null}<AdminShell>{children}</AdminShell></>;
}
```

The only thing stopping a non-admin from reaching the platform console is `middleware.ts:26`:

```ts
if (pathname.startsWith("/admin") && role !== "platform_admin") { /* redirect to /app */ }
```

Compare `app/(agency)/layout.tsx:8`, which *does* re-check at the layout level:

```ts
if (session.role !== "agency_admin" && data.subscription.tier !== "agency") redirect("/app");
```

The highest-privilege surface has the weakest enforcement — a single layer, in the component of the Next.js stack with the worst historical track record for authorization bypass (CVE-2025-29927). The installed 15.5.20 is patched, so there is no known live bypass; this is a defense-in-depth gap that turns any future middleware CVE into an immediate platform-console breach.

Individual admin *pages* read `data.platform.tenants` from the current workspace's `dataset_meta` rather than issuing cross-tenant queries, and `setFeatureFlagAction` re-checks `scoped("platform_admin")` — so exposure would be limited to the viewer's own workspace metadata. Still: add the role check.

**Fix.** Mirror the agency layout — `if (session.role !== "platform_admin") redirect("/app");`

---

### V10 — No CSP or anti-framing on any public surface
**Severity: Medium** · CWE-1021 (Improper Restriction of Rendered UI Layers), CWE-693
**File:** `middleware.ts:60-68`

The CSP — including `frame-ancestors 'none'` — is set **only** inside `middleware`, whose matcher is:

```ts
matcher: ["/app/:path*", "/agency/:path*", "/admin/:path*", "/onboarding/:path*", "/staff/:path*"]
```

`next.config.ts` applies `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP, and HSTS to `/:path*` — but **no CSP and no `X-Frame-Options`**.

So these get no CSP and no framing protection at all:

- `/r/[token]` — the customer review flow (the product's primary untrusted-user surface)
- `/q/[slug]` — the QR scan endpoint
- `/w/[slug]` — the public review widget
- `/` and all marketing/pricing/legal/resources pages
- Every `/api/*` route

The customer review flow being framable is the concrete risk: an attacker can iframe `/r/<token>` under a decoy UI and clickjack a customer into submitting a rating or being redirected to Google. `e2e/security.spec.ts:54` asserts CSP headers, but only after `enterDemo` on `/app` — so this gap is invisible to the existing test.

**Fix.** Move the security headers into `next.config.ts` `headers()` so they apply globally, or extend the middleware matcher. The widget at `/w/[slug]` is *designed* to be iframed, so give it a targeted `frame-ancestors` policy rather than `'none'`.

---

### V11 — Hardcoded fallback secrets in a public repository
**Severity: Medium** · CWE-798 (Hardcoded Credentials), CWE-1188 (Insecure Default)

Four signing/encryption secrets have literal fallbacks committed to a **public** GitHub repo:

| File | Constant |
|---|---|
| `lib/auth/jwt.ts:18` | `"foundly-dev-secret-set-AUTH_SECRET-in-production"` |
| `lib/google/crypto.ts:15` | `"foundly-dev-encryption-set-ENCRYPTION_SECRET-in-production"` |
| `lib/security/content-asset-signature.ts:11` | `"foundly-content-asset-development-only"` |
| `lib/referrals/code.ts:5` | `"foundly-referral-development-only"` |

The first three throw when `process.env.NODE_ENV === "production"`, which covers a standard Vercel deploy. **`lib/referrals/code.ts` has no production guard at all:**

```ts
function secret(): string {
  return process.env.AUTH_SECRET || "foundly-referral-development-only";
}
```

**Risk.** Any deployment not running with `NODE_ENV === "production"` — a self-hosted instance with a custom start script, a container that forgets the env var, a staging box — signs session JWTs with a secret published on GitHub. Anyone can then forge a token with arbitrary `userId`, `workspaceId`, and `role: "platform_admin"`, since `verifySession` validates nothing beyond the signature and the role string. V2's `/setup` page tells an attacker whether `AUTH_SECRET` is set.

**Fix.** Fail hard on a missing secret in *every* environment except an explicit `NODE_ENV === "development"` local run, and add the production guard to `lib/referrals/code.ts`.

---

### V12 — Public "Google rating" and review count are client-writable and unvalidated
**Severity: Medium** · CWE-20 (Improper Input Validation), CWE-1284
**Files:** `lib/actions.ts:560`, `lib/data/drizzle-provider.ts:2804`

```ts
export async function updateLocationGoogleAction(patch: GoogleLocationPatch) {
  const { provider, ws } = await scoped("owner", "manager");
  await provider.updateLocationGoogle(ws, patch);      // patch forwarded verbatim
  revalidatePath("/", "layout");
}
```

`GoogleLocationPatch` carries `placeId`, `name`, `address`, `city`, `category`, `rating`, `reviewCount`. Nothing between the client and the database validates length, range, or shape — the provider stores `rating`/`reviewCount` if `typeof === "number"` and the strings if truthy. There is no `0 ≤ rating ≤ 5` check and no upper bound on `reviewCount`.

Contrast this with the care taken elsewhere: `createOrganizationWorkspaceAction` (`lib/actions.ts:1515`) slices every string, and `runRankGridAction` bounds every numeric input.

**Impact.** Those exact fields are rendered on the **unauthenticated** widget at `/w/[slug]` (`lib/data/index.ts:136` → `app/(customer)/w/[slug]/page.tsx`) and presented to the public as the business's real Google rating and review count:

```tsx
{data.rating.toFixed(1)} · {data.reviewCount.toLocaleString()} reviews
```

A tenant can publish "5.0 · 12,000 reviews" on their own website through Foundly's widget with no Google data behind it. For a product whose entire value proposition is *authentic* review data — and which ships a `lib/compliance/` module specifically to keep output honest — that is an integrity failure with real reputational and regulatory exposure, not just a validation nit. The unbounded strings are also a storage-abuse vector.

`reviewUrl` is **not** injectable — it is always rebuilt as `https://search.google.com/local/writereview?placeid=${patch.placeId}`, so the origin is fixed and there is no `javascript:` XSS path. Only the query string is attacker-influenced.

**Fix.** Validate at the action boundary: clamp `rating` to `[0, 5]` and `reviewCount` to a sane maximum, bound every string, and constrain `placeId` to Google's `ChIJ`-style format. Better, mark owner-entered figures as unverified in the widget and only display Places-sourced numbers as "Google".

---

### V13 — `script-src 'unsafe-inline'` in the CSP
**Severity: Low** · CWE-1021
**File:** `middleware.ts:32`

```ts
`script-src 'self' 'unsafe-inline'${scriptDev}`,
```

`'unsafe-inline'` is present in production, not just dev, which removes most of the XSS-mitigation value of the policy on the routes that have one. Combined with V10 (no CSP anywhere public), the CSP provides little defense in depth. Currently theoretical — there are no XSS sinks in the codebase today — but it means any future injection has no second line of defense.

**Fix.** Next.js supports nonce-based CSP from middleware; generate a per-request nonce and drop `'unsafe-inline'`.

---

### V14 — Origin check fails open when the header is absent
**Severity: Low** · CWE-352
**File:** `lib/security/api.ts:29`

```ts
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;                    // ← fail open
  ...
}
```

Any non-browser client that simply omits `Origin` passes the CSRF guard on every public API route. Modern browsers send `Origin` on all cross-origin POSTs, so browser-driven CSRF is still blocked — the practical effect is that scripted abuse (which is exactly the threat V3 enables) sails through unimpeded.

**Fix.** For state-changing requests, treat a missing `Origin` as a failure, or require a same-site custom header.

---

### V15 — Staff invite tokens are issued and emailed but never redeemable
**Severity: Low** (functional + access-control hygiene)
**File:** `lib/actions.ts:1404-1432`

`inviteStaffAction` creates a `staff_invite` row with a `nanoid` token and mails a link:

```ts
link: `${base}/sign-up?invite=${result.token}`
```

**Nothing in the sign-up path reads the `invite` parameter.** Grepping `app/(auth)/sign-up/` for "invite" returns nothing, and `registerUser` unconditionally assigns `role: "owner"` and creates a fresh workspace and organization.

So an invited staff member who follows the link does not join the inviting workspace — they silently create their own separate owner-level tenant. Meanwhile long-lived invite tokens accumulate in the database with no expiry and no consumption path.

The one silver lining: because there is no redemption path, the `staff`/`manager` roles are effectively unreachable outside the demo, which limits the blast radius of any role-scoping mistake elsewhere.

**Fix.** Implement invite consumption (validate token → single-use → join the inviting workspace with the invited role), or stop issuing the tokens. Add expiry either way.

---

### V16 — Anyone can mint a `platform_admin` session
**Severity: Low** (contained) · CWE-1220
**File:** `lib/actions.ts:377`

```ts
export async function enterDemoAction(role: SessionRole = "owner") {
  await createDemoSession(role);      // role taken from the client, never validated
}
```

This is reachable by any anonymous caller with any role string, and `app/(auth)/sign-in/SignInForm.tsx:17` exposes a "Demo: Admin" button that does exactly this — so it is an intentional product feature, not an oversight.

Impact is contained because demo sessions are pinned to `isDemo: true` and `workspaceId: "ws_harbourview"`, and `getProviderFor()` (`lib/data/index.ts:34`) forces every demo session onto the in-memory provider — real tenant data is never reachable. `resetDemoAction` reseeds only `DEMO_WORKSPACE_ID`. Admin pages read seeded `dataset_meta`, not live cross-tenant queries.

It is still worth flagging: it is an unauthenticated path to a `platform_admin` JWT and to `setFeatureFlagAction`, and `verifySession` will accept `role: "platform_admin"` from any client-supplied value that survives the role allowlist. If the deployment ever runs without `DATABASE_URL`, real registered accounts land in the *same* in-memory store as the demo tenant — worth verifying isolation before that configuration is used.

**Fix.** Validate `role` against the demo-permitted set explicitly, and keep the admin layout role check from V9 so the console has its own gate.

---

### V17 — Credential hygiene
**Severity: Low**
**File:** `lib/auth/password.ts`

- **bcrypt cost factor 10** (`ROUNDS = 10`, line 5). Below the current OWASP recommendation of ≥12 for bcrypt. Cheap to raise.
- **Weak password policy** (line 19): 8 characters, at least one letter and one digit. No breached-password check (e.g. HIBP k-anonymity), which matters more than composition rules.
- **No email verification.** `emailVerified` is hardcoded `true` on registration with the comment `// auto-verified until email sending is configured` (`lib/data/drizzle-provider.ts:984`, `lib/data/memory-provider.ts:378`), and the flag is never used as a gate anywhere. Accounts are fully functional — including sending review requests to imported customer lists via Resend/Twilio — without ever proving control of the email address. That is a spam/abuse vector on a platform whose core function is outbound messaging.

---

## 4. Recommended remediation order

**Immediate**

1. Authenticate `app/(marketing)/setup/actions.ts` and gate `/setup` (**V1**, **V2**) — highest impact-to-effort ratio; stops unbounded provider billing today.
2. `npm audit fix` and add a dependency gate to CI (**V5**).
3. Set `APP_URL` in every environment and stop building auth links from headers (**V4**).
4. Fix client-IP derivation (**V3**) and move rate-limit state to Redis/KV (**V7**).

**Short term**

5. Pin the resolved IP in the website crawler (**V6**).
6. Add `sessionVersion` for revocation (**V8**).
7. Add the role check to `app/(admin)/layout.tsx` (**V9**).
8. Move security headers to `next.config.ts` so public routes get CSP and framing protection (**V10**, **V13**).
9. Add the production guard to `lib/referrals/code.ts` and harden the other three (**V11**).
10. Validate `GoogleLocationPatch` at the action boundary (**V12**).

**Backlog**

11. Fail-closed origin checks (**V14**); implement or remove staff invites (**V15**); constrain demo roles (**V16**); raise bcrypt cost, add breached-password checks, implement email verification (**V17**).

---

## 5. Scope and caveats

- **Static review only.** No exploit was executed and no deployment was probed. Every finding is traced to a specific file and line; preconditions (`NODE_ENV`, `APP_URL`, `DATABASE_URL`, deployment topology) are stated where they gate exploitability.
- **Reviewed in depth:** middleware, `lib/auth/*`, `lib/security/*`, `lib/actions.ts` (all 1,655 lines), every route under `app/api/**`, `lib/data/index.ts` and provider selection, `lib/db/*`, `lib/google/{oauth,crypto,config}`, `lib/billing/{stripe,reconcile}`, `lib/sms/twilio`, `lib/evidence/website`, `lib/referrals/code`, `lib/email/*`, `lib/utils/app-url`, config files, and the CI workflow.
- **Sampled, not exhaustive:** the 3,721-line `lib/data/drizzle-provider.ts` and the 1,390-line `lib/data/memory-provider.ts` were reviewed for raw SQL (none found) and spot-checked for workspace scoping across ~15 mutation functions (all correctly scoped). A full line-by-line tenancy audit of both providers is the main remaining gap. `lib/ai/*`, `lib/compliance/*`, `lib/monitoring/*`, and the UI component tree were reviewed at the interface level only.
- **Not assessed:** live infrastructure, Vercel project configuration, actual environment-variable values, Google Cloud / Stripe / Twilio account-side settings, or any deployed instance.
