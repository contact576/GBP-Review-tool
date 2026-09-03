# Foundly — API Endpoint Inventory & Vulnerability Map

**Repo:** `contact576/GBP-Review-tool` · **Branch:** `shrikaanth-update` · **Commit:** `084eae3`
**Date:** 2026-07-23
**Companion document:** [`SECURITY-REVIEW.md`](./SECURITY-REVIEW.md) — findings are referenced below as **V1**–**V17**.

---

## 0. How to read this document

**"Loose endpoint"** here means an endpoint reachable by an unauthenticated remote caller, or one whose only protection is a control that can be bypassed or fails open. Every such endpoint is marked 🔴 **LOOSE** or 🟠 **WEAK** in the tables.

A critical point about this codebase's shape:

> **Next.js Server Actions are HTTP endpoints.** A `"use server"` exported function is invokable by anyone who can POST to the hosting route with a `Next-Action: <action-id>` header. They do not appear in `app/api/`, they are not covered by the `middleware.ts` matcher unless their host route is, and they are not visible in a conventional route listing. **48 of this app's 75 remotely-invokable endpoints are server actions.** Any endpoint inventory that only counts `app/api/**` misses 64% of the attack surface.

This matters more than usual here because `next@15.5.20` carries **GHSA-955p-x3mx-jcvp — unauthenticated disclosure of internal Server Function endpoints** (see **V5**), which makes action IDs discoverable rather than requiring an attacker to scrape them from the client bundle.

### Attack surface at a glance

| Category | Count | Unauthenticated | Notes |
|---|---:|---:|---|
| API route handlers (`app/api/**`) | 23 | 12 | 6 legitimately public, 3 signature-gated, 3 loose |
| Non-API route handlers | 4 | 4 | All benign static/redirect handlers |
| Server actions — `lib/actions.ts` | 44 | 7 | 37 role-gated via `scoped()` |
| Server actions — `app/(marketing)/setup/actions.ts` | 3 | **3** | 🔴 **All three ungated — V1** |
| Server actions — inline (`onboarding/test-invite`) | 1 | 0 | Transitively gated |
| **Total remotely invokable** | **75** | **26** | |

### Middleware coverage gap

`middleware.ts` is the only place a Content-Security-Policy is set, and its matcher is:

```ts
matcher: ["/app/:path*", "/agency/:path*", "/admin/:path*", "/onboarding/:path*", "/staff/:path*"]
```

**Everything else runs with no CSP, no `frame-ancestors`, and no JWT pre-check** — including all 23 API routes, the customer review flow, the public widget, the QR endpoint, and every marketing page (which is where the ungated `setup` actions live). See **V10**.

| Path space | Middleware applies? | CSP? | Framable? |
|---|:--:|:--:|:--:|
| `/app`, `/agency`, `/admin`, `/onboarding`, `/staff` | ✅ | ✅ | No |
| `/api/**` (all 23) | ❌ | ❌ | n/a |
| `/r/[token]` — customer review flow | ❌ | ❌ | 🔴 **Yes** |
| `/w/[slug]` — public widget | ❌ | ❌ | Yes (by design) |
| `/q/[slug]` — QR scan | ❌ | ❌ | n/a |
| `/`, `/pricing`, `/score`, `/setup`, `/legal/*` | ❌ | ❌ | Yes |

---

## 1. API route handlers — `app/api/**` (23 endpoints)

### 1.1 Master table

| # | Endpoint | Method | Auth | Rate limit | Status | Findings |
|---|---|---|---|---|---|---|
| A1 | `/api/health` | GET | None (base) / secret-or-admin (`?deep=1`) | 5/min on deep | 🟠 WEAK | V3 |
| A2 | `/api/health?deep=1` | GET | `x-foundly-health-secret` **or** `platform_admin` | 5/min + 60s global throttle | ✅ OK | — |
| A3 | `/api/cron/monitor` | GET | Bearer `CRON_SECRET`, constant-time, min 24 chars | None | ✅ OK | — |
| A4 | `/api/score/lookup` | POST | **None** — public by design | 20/min per IP | 🔴 LOOSE | V3, V14 |
| A5 | `/api/places/search` | POST | Session + `owner\|manager` | 30/min | ✅ OK | V3, V7 |
| A6 | `/api/ai/campaign-copy` | POST | Session + `owner\|manager` | 20/min | ✅ OK | V3, V7 |
| A7 | `/api/ai/feedback-summary` | POST | Session + `owner\|manager` | 15/min | ✅ OK | V3, V7 |
| A8 | `/api/ai/reply-draft` | POST | Session + `owner\|manager` | 30/min | ✅ OK | V3, V7 |
| A9 | `/api/ai/report-narration` | POST | Session + `owner\|manager` | 10/min | ✅ OK | V3, V7 |
| A10 | `/api/ai/task-copy` | POST | Session + `owner\|manager` | 20/min | ✅ OK | V3, V7 |
| A11 | `/api/ai/review-edit` | POST | **None** — review token only | 30/min IP + 10/min token | 🔴 LOOSE | **V3**, V7, V14 |
| A12 | `/api/ai/review-draft` | POST | **None** — review token only | 30/min IP + 12/min token | 🔴 LOOSE | **V3**, V7, V14 |
| A13 | `/api/ai/score-sample` | POST | n/a — returns HTTP 410 | n/a | ✅ Retired | — |
| A14 | `/api/ai/content-assets/[assetId]` | GET | Session + 4 roles + id regex | 120/min | ✅ OK | — |
| A15 | `/api/public/content-assets/[assetId]` | GET | HMAC-SHA256 signature + expiry | None | ✅ OK | — |
| A16 | `/api/auth/google` | GET | **None** — sign-in entry | None | 🟠 WEAK | V4 |
| A17 | `/api/auth/google/callback` | GET | OAuth state cookie + JWKS-verified ID token | None | ✅ OK | V4 |
| A18 | `/api/google/connect` | GET | Session + `owner\|manager` | None | ✅ OK | — |
| A19 | `/api/google/connect/callback` | GET | Session + role + OAuth state | None | ✅ OK | — |
| A20 | `/api/instagram/connect` | GET | Session + `owner\|manager` | None | ✅ OK | — |
| A21 | `/api/instagram/connect/callback` | GET | Session + role + OAuth state | None | ✅ OK | — |
| A22 | `/api/webhooks/stripe` | POST | HMAC-SHA256 + 300s window, constant-time | None | ✅ OK | — |
| A23 | `/api/webhooks/twilio/inbound` | POST | HMAC-SHA1 URL+params, constant-time | None | ✅ OK | V4 |
| A24 | `/api/webhooks/twilio/status` | POST | HMAC-SHA1 + query-param regex | None | ✅ OK | V4 |

*(A2 is `/api/health` with a query param — 23 distinct route files.)*

### 1.2 Loose endpoints — detail

---

#### 🔴 A11 · `POST /api/ai/review-edit` — unauthenticated, spends AI credits
**File:** `app/api/ai/review-edit/route.ts`

The only unauthenticated endpoint in the app that calls a **billed LLM provider**.

```ts
const ipLimited = guardPublicApi(req, "ai-review-edit-ip", 30, 60_000);
if (ipLimited) return ipLimited;
const context = await findRequestByToken(token);
if (!context) return NextResponse.json({ error: "invalid_token" }, { status: 404 });
const tokenLimited = guardPublicApi(req, "ai-review-edit-token", 10, 60_000, token);
```

**Design is sound** — it requires a valid review token, checks the token before spending, and layers two rate limits. The problem is the limits themselves:

- The 30/min IP limit is keyed on `requestIdentity()`, which trusts `cf-connecting-ip` verbatim (**V3**) → rotate the header, get unlimited buckets.
- The 10/min token limit is real, but buckets live in one lambda's heap (**V7**) → multiplied by warm-instance count, reset on cold start.
- `sameOrigin()` returns `true` when `Origin` is absent (**V14**) → a scripted client passes trivially.

**Net:** anyone holding *one* valid review token (they receive one legitimately as a customer, or mint one by scanning any public QR code at `/q/[slug]`) can drive effectively unbounded Anthropic spend.

**Fix:** derive the IP from the platform's trusted header; move buckets to Redis/KV; add a hard per-token lifetime budget (e.g. 20 total edits per review token, not per minute).

---

#### 🔴 A4 · `POST /api/score/lookup` — unauthenticated, spends Google Places quota
**File:** `app/api/score/lookup/route.ts`

Public by design — it powers the free `/score` marketing tool. Input is properly bounded (`readJsonObject(req, 8_192)`, `boundedString`). But every call that passes the `business` check issues a **billed Google Places Text Search**:

```ts
const limited = guardPublicApi(req, "score-lookup", 20, 60_000);   // ← V3-bypassable
...
const result = await searchBusinesses(...)                          // ← billed
```

Same bypass chain as A11 (**V3** + **V7** + **V14**). Beyond direct cost, exhausting the Places quota breaks onboarding business-lookup and rank-grid scans for **paying tenants** — an availability impact on the product's core flow, not just a bill.

**Fix:** trusted-header IP derivation, durable rate-limit store, and a global daily Places budget with a circuit breaker that degrades to the existing `{ ok: true, real: false }` synthetic path.

---

#### 🟠 A1 · `GET /api/health` — unauthenticated service fingerprint
**File:** `app/api/health/route.ts:18`

The base response is thin and safe:

```json
{ "ok": true, "service": "foundly", "time": "..." }
```

`?deep=1` is **correctly gated** (`HEALTH_CHECK_SECRET` via constant-time compare, **or** a `platform_admin` session) and additionally throttled to 5/min plus a 60-second global lock — this is the model the `setup` actions should have copied. Only issue: no rate limit on the base path, so it is a free liveness/fingerprint oracle. Low impact.

---

#### 🟠 A16 · `GET /api/auth/google` — Host-header sink
**File:** `app/api/auth/google/route.ts:19`

Unauthenticated by necessity (it starts sign-in). The OAuth state cookie is random, httpOnly, `sameSite: lax`, 10-minute TTL — correct. The concern is the redirect URI:

```ts
const origin = await appUrl();
buildAuthUrl({ ..., redirectUri: `${origin}/api/auth/google/callback` });
```

When `APP_URL`/`NEXT_PUBLIC_APP_URL` is unset, `appUrl()` derives the origin from `x-forwarded-host`/`host` (**V4**). Google's registered-redirect-URI allowlist blocks the obvious attack — an attacker-controlled `redirect_uri` will be rejected at Google's end — so this is **not** directly exploitable for token theft. It is listed because it shares the sink with the genuinely exploitable password-reset path (**V4**, S3 below) and will silently break if the deployment domain changes.

---

### 1.3 Endpoints that hold up well

Worth recording, because they set the standard the loose ones fail to meet:

| Endpoint | What it does right |
|---|---|
| **A3** `/api/cron/monitor` | `isMonitoringCronAuthorized()` — requires `Bearer`, enforces a **minimum 24-char secret**, `timingSafeEqual` with a length pre-check. Fails closed when `CRON_SECRET` is unset. |
| **A22** `/api/webhooks/stripe` | Reads the **raw body** before parsing, HMAC-SHA256 over `${timestamp}.${payload}`, 300s replay window, constant-time compare across all `v1` signatures, returns 5xx on reconciliation failure so Stripe retries rather than silently losing entitlement state. |
| **A23/A24** Twilio webhooks | Canonical HMAC-SHA1 over URL + sorted params, constant-time. A24 additionally regex-validates the `workspaceId`/`requestId` query params — and because they are inside the signed URL, they cannot be tampered with. |
| **A15** `/api/public/content-assets/[assetId]` | HMAC-SHA256 over `workspace:asset:expiry`, constant-time, **rejects expiries more than 48h out** (not just expired ones), enforces strict `asset_[a-f0-9]{24}` and workspace-id regexes, serves with `Content-Security-Policy: default-src 'none'; sandbox` + `nosniff`. |
| **A17** `/api/auth/google/callback` | ID token verified against Google's **remote JWKS with issuer and audience pinning** — not merely base64-decoded, which is the common mistake here. |
| **A14** `/api/ai/content-assets/[assetId]` | Session + role + id-format check, and the DB lookup is scoped by `workspaceId` — no IDOR. |

---

## 2. Non-API route handlers (4 endpoints)

| # | Endpoint | Method | Auth | Assessment |
|---|---|---|---|---|
| B1 | `/q/[slug]` | GET | **None** — public QR scan | 🟠 See below |
| B2 | `/sw.js` | GET | None | ✅ Static string; scoped `Service-Worker-Allowed: /staff/`; same-origin GET-only fetch handler |
| B3 | `/manifest.webmanifest` | GET | None | ✅ Static JSON |
| B4 | `/pwa-icon?size=` | GET | None | ✅ `size` clamped to `192\|512` before interpolation — no injection |

#### 🟠 B1 · `GET /q/[slug]` — unauthenticated write + token minting
**File:** `app/q/[slug]/route.ts`

Every scan **mints a fresh review-request token** and increments the QR asset's scan counter — an unauthenticated database write, with **no rate limit at all**:

```ts
const result = await provider.mintRequestFromQrSlug(slug);
if (result) return NextResponse.redirect(new URL(`/r/${result.token}`, base), 302);
```

Two consequences:

1. **Row inflation / metric poisoning.** Hammering a known slug creates unbounded `review_request` rows and corrupts the scan/open analytics the owner is paying to see.
2. **Free token minting.** This is the supply line for the A11 abuse path — anyone can obtain valid review tokens on demand without ever being a customer.

The redirect itself is safe: the destination is built as `new URL("/r/" + token, base)` from a server-generated token, so there is no open redirect. Unknown slugs fall through to `/q-expired` rather than erroring — good UX, and it means slug enumeration is not distinguishable by status code.

**Fix:** rate-limit per slug and per IP; consider a short-lived cooldown per slug so a single physical QR code cannot mint hundreds of tokens per minute.

---

## 3. Server actions (48 endpoints) — the hidden API

### 3.1 🔴 Ungated: `app/(marketing)/setup/actions.ts` — **V1**

The single most serious loose surface in the application. Three exported server actions, **zero authentication, zero rate limiting**, hosted on a route group the middleware does not cover:

| # | Action | What it does on invocation | Cost per call |
|---|---|---|---|
| S1 | `initDbAction()` | Runs `ensureSchema()` — DDL against the production Postgres | DB connection + DDL |
| S2 | `testAiAction()` | Live Anthropic completion | **Billed Anthropic call** |
| S3 | `testPlacesAction()` | Live Google Places Text Search | **Billed Places call** |

```ts
"use server";
export async function initDbAction(): Promise<{ ok: boolean; error?: string }> {
  const result = await ensureSchema();          // no session check
  return { ok: result.ok, error: result.error };
}
```

**Impact:** an attacker loops S2/S3 to drive unbounded Anthropic and Google Maps Platform spend. Exhausting Places quota also degrades onboarding and rank-grid for paying tenants. S1 reaches the production database on demand.

**Mitigating:** `lib/db/schema-sql.ts` contains exclusively `CREATE TABLE/INDEX IF NOT EXISTS` — nothing destructive — and `ensureSchema` short-circuits on a `globalThis` flag after first success. So S1's impact is connection load, not data loss.

**Amplified by:** **V2** (the public `/setup` page confirms which providers are configured, i.e. which of S2/S3 will actually spend money) and **V5** GHSA-955p-x3mx-jcvp (makes the action IDs discoverable).

**Fix:** gate all three behind `platform_admin` or `HEALTH_CHECK_SECRET`, and add `consumeRateLimit` to S2/S3. `/api/health?deep=1` (A2) already implements exactly this — reuse it verbatim.

---

### 3.2 🔴 Unauthenticated by design — `lib/actions.ts` (7 actions)

These legitimately need to run without a session, but each carries a caveat.

| # | Action | Line | Control | Caveat |
|---|---|---:|---|---|
| S4 | `registerAction` | 196 | 30/10min per IP | IP bypassable (**V3**); email auto-verified, never enforced (**V17**) |
| S5 | `loginAction` | 247 | 10/10min per **email** + 100/10min per IP | Email bucket is the only non-spoofable auth control in the app — and it's per-instance (**V7**) |
| S6 | `requestPasswordResetAction` | 291 | 20/hr IP + 5/hr email | 🔴 **Host-header link poisoning — V4** |
| S7 | `resetPasswordAction` | 342 | 30/hr IP + 5/hr token-hash | Correct single-use claim; but does not invalidate existing sessions (**V8**) |
| S8 | `enterDemoAction` | 377 | **None** | Accepts any `role` from the client, including `platform_admin` (**V16**) |
| S9 | `signInAction` | 382 | **None** | Deprecated alias for S8 — same issue, and dead code |
| S10 | `signOutAction` | 386 | **None** | Harmless (cookie delete only) — but see **V8**: the JWT stays valid |

---

#### 🔴 S6 · `requestPasswordResetAction` — account takeover via Host header (**V4**)

The highest-severity server action. The reset link is built from `appUrl()`:

```ts
const base = await appUrl();
const template = passwordResetEmail({
  link: `${base}/reset-password?token=${encodeURIComponent(token)}`,
});
```

**Precondition:** neither `NEXT_PUBLIC_APP_URL` nor `APP_URL` is set. The project explicitly supports this — `.env.example` comments both out and `lib/utils/app-url.ts`'s docstring frames the header fallback as a feature. The public `/setup` page (**V2**) lets an attacker confirm the precondition remotely before attempting anything.

**Attack:** POST a reset request for `victim@example.com` with `X-Forwarded-Host: attacker.tld`. Foundly sends the victim a **genuine** reset email — correct From address, correct template, correct branding — whose link points at `https://attacker.tld/reset-password?token=<valid one-time token>`. One click → full tenant takeover.

Everything *else* about this flow is well built: 32 random bytes, stored only as a SHA-256 hash, one active token per user, single-use via a conditional `UPDATE ... WHERE used_at IS NULL AND expires_at > now`, generic non-enumerating response, and the token is revoked if delivery fails. The Host header is the one crack.

**Same sink, other surfaces:** staff invite links (`lib/actions.ts:1422`), review-request links in email and SMS (`:131`, `:153`), the Twilio status-callback URL (`:155`), and `createSignedContentAssetUrl`'s base.

---

#### 🟠 S8 · `enterDemoAction` — unauthenticated `platform_admin` session (**V16**)

```ts
export async function enterDemoAction(role: SessionRole = "owner") {
  await createDemoSession(role);      // role taken from the client, never validated
}
```

Reachable by any anonymous caller with any role string. `app/(auth)/sign-in/SignInForm.tsx:17` exposes a "Demo: Admin" button that does exactly this, so it is an intentional product feature.

**Contained, but flag it:** demo sessions are pinned to `isDemo: true` + `workspaceId: "ws_harbourview"`, and `getProviderFor()` forces every demo session onto the in-memory provider — real tenant data is unreachable. It is still an unauthenticated path to a `platform_admin` JWT and to `setFeatureFlagAction` (S48). Combined with **V9** (the `/admin` layout never re-checks the role), the platform console has exactly one gate.

⚠️ **Configuration warning:** if the deployment ever runs **without `DATABASE_URL`**, `getRealProvider()` also returns the in-memory provider — real registered accounts then share a store with the demo tenant. Verify isolation before using that configuration.

---

### 3.3 🟢 Token-gated public actions (2)

| # | Action | Line | Control |
|---|---|---:|---|
| S11 | `advanceRequestAction` | 424 | `guardPublicAction("review-progress", token, 20)` — 60/10min IP + 20/10min token; transition enum validated; rating bounded 1–5; attributes capped at 12 × 60 chars |
| S12 | `submitPrivateFeedbackAction` | 458 | `guardPublicAction("private-feedback", token, 5)` — same, plus text truncated to 4,000 chars and a re-submit guard |

Input validation here is genuinely good. Both inherit the **V3** IP-spoofing and **V7** per-instance weaknesses, but the per-token limits are the meaningful control and those hold.

---

### 3.4 ✅ Role-gated actions (37) — `scoped()` / `requireRole()`

All correctly enforce a session **and** a role allowlist before touching data. Every provider mutation I sampled filters on `workspaceId` alongside the row id — **no IDOR found**.

<details>
<summary><b>Full listing (click to expand)</b></summary>

| Action | Line | Required role(s) |
|---|---:|---|
| `captureCustomerAction` | 392 | owner, manager, staff |
| `addCustomerAction` | 403 | owner, manager, staff |
| `sendRequestAction` | 410 | owner, manager, staff |
| `markNotificationsReadAction` | 1443 | owner, manager, staff |
| `resolveFeedbackAction` | 488 | owner, manager |
| `approveTaskAction` | 495 | owner, manager |
| `snoozeTaskAction` | 502 | owner, manager |
| `createTaskAction` | 508 | owner, manager |
| `postReplyAction` | 516 | owner, manager |
| `createCampaignAction` | 524 | owner, manager |
| `setCampaignStatusAction` | 531 | owner, manager |
| `updateConsentAction` | 538 | owner, manager |
| `updateLocationGoogleAction` | 560 | owner, manager · 🟠 **V12 — no input validation** |
| `syncGoogleAction` | 586 | owner, manager |
| `generateContentSuggestionPreviewAction` | 668 | owner, manager · +8/hr per-user AI limit |
| `approveProfileSuggestionAction` | 855 | owner, manager |
| `approveContentSuggestionAction` | 1024 | owner, manager · +20/hr per-user limit |
| `runRankGridAction` | 1211 | owner, manager · + plan-tier + monthly-scan caps |
| `inviteStaffAction` | 1404 | owner, manager · 🟠 **V15 — token never redeemable** |
| `addStaffMemberAction` | 1434 | owner, manager |
| `importCustomersAction` | 1467 | owner, manager |
| `switchWorkspaceAction` | 1500 | owner, manager · ✅ verifies org membership before re-minting the session |
| `updateIndustryAction` | 548 | owner |
| `updateWorkspaceSettingsAction` | 554 | owner |
| `createOrganizationWorkspaceAction` | 1511 | owner · ✅ all inputs bounded |
| `changePlanAction` | 1567 | owner |
| `pauseSubscriptionAction` | 1577 | owner |
| `downgradeToFreeAction` | 1587 | owner |
| `startCheckoutAction` | 1603 | owner · ✅ tier allowlisted before env lookup |
| `openBillingPortalAction` | 1650 | owner |
| `updateWhiteLabelAction` | 1301 | owner, agency_admin · + plan check |
| `sendAgencyReportsAction` | 1319 | owner, agency_admin · + plan check, 100-target cap |
| `createAgencyClientAction` | 1533 | owner, agency_admin · + plan check, all inputs bounded |
| `setFeatureFlagAction` | 1459 | **platform_admin** |
| `resetDemoAction` | 1450 | any session + `isDemo` check · ✅ reseeds only `ws_harbourview` |
| `previewReviewPage` (inline) | onboarding | Transitively gated via `getData()` + `captureCustomerAction` |

</details>

#### 🟠 Notable within this group

**S-`updateLocationGoogleAction`** (line 560) — **V12**. Correctly role-gated, but forwards the client's `GoogleLocationPatch` to the provider **verbatim**:

```ts
export async function updateLocationGoogleAction(patch: GoogleLocationPatch) {
  const { provider, ws } = await scoped("owner", "manager");
  await provider.updateLocationGoogle(ws, patch);      // no validation
}
```

No length bounds on `name`/`address`/`city`/`category`; no `0 ≤ rating ≤ 5`; no ceiling on `reviewCount`. Those exact fields render on the **unauthenticated** widget `/w/[slug]` as the business's real Google rating:

```tsx
{data.rating.toFixed(1)} · {data.reviewCount.toLocaleString()} reviews
```

A tenant can publish "5.0 · 12,000 reviews" on their own website through Foundly's widget with no Google data behind it. For a product whose value proposition is *authentic* review data — and which ships `lib/compliance/` specifically to keep output honest — that is an integrity failure, not a validation nit.

`reviewUrl` is **not** injectable: it is always rebuilt as `https://search.google.com/local/writereview?placeid=${patch.placeId}`, so the origin is fixed and there is no `javascript:` XSS path. Only the query string is attacker-influenced.

Contrast `createOrganizationWorkspaceAction` (line 1515), which slices every string, and `runRankGridAction` (line 1217), which bounds every numeric input — the codebase knows how to do this.

**S-`inviteStaffAction`** (line 1404) — **V15**. Mints a `staff_invite` token and emails `/sign-up?invite=<token>`. **Nothing in the sign-up path reads the `invite` parameter** — `registerUser` unconditionally assigns `role: "owner"` and creates a fresh workspace. Invited staff silently create their own separate tenant; unconsumed tokens accumulate with no expiry. Silver lining: because there is no redemption path, `staff`/`manager` roles are effectively unreachable outside the demo, which caps the blast radius of any role-scoping mistake.

---

## 4. Public page routes that behave as endpoints (3)

| # | Route | Auth | Assessment |
|---|---|---|---|
| P1 | `/setup` | **None** | 🔴 Discloses the full deployment secret/config posture — **V2** |
| P2 | `/r/[token]` | Review token | 🟠 No CSP, framable → clickjacking — **V10** |
| P3 | `/w/[slug]` | **None** | 🟠 Renders client-writable "Google" figures — **V12**; framable by design |

#### 🔴 P1 · `/setup` — configuration disclosure (**V2**)
**File:** `app/(marketing)/setup/page.tsx:16-42`

Renders a boolean for **every** security-relevant environment variable to any anonymous visitor:

```ts
const authSecret         = Boolean(process.env.AUTH_SECRET);
const encSecret          = Boolean(process.env.ENCRYPTION_SECRET);
const assetSigningSecret = Boolean(process.env.CONTENT_ASSET_SIGNING_SECRET || process.env.AUTH_SECRET);
const cronSecret         = Boolean(process.env.CRON_SECRET && process.env.CRON_SECRET.length >= 24);
const appUrlSet          = Boolean(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL);
// ...plus Stripe, Twilio, Resend, Google, OpenAI, and DB reachability
```

It also calls `checkDatabase()`, which returns the **raw driver error string** on failure — typically leaking the database host and driver details.

No secret *values* leak. The problem is that it is a precision reconnaissance oracle telling an attacker exactly which findings are live on this deployment:

| Field shown | What it tells an attacker |
|---|---|
| `appUrlSet: false` | 🔴 **V4** is exploitable → password-reset link poisoning |
| `authSecret: false` | 🔴 **V11** is exploitable → forge any JWT with the public fallback secret |
| `cronSecret: false` | `/api/cron/monitor` (A3) is open |
| `ai: true` / `places: true` | S2/S3 (**V1**) will actually spend money |
| DB error string | Database host and driver fingerprint |

---

## 5. Ranked loose-end register

| Rank | Endpoint(s) | Exposure | Impact | Finding |
|---:|---|---|---|---|
| 1 | **S1–S3** `setup/actions.ts` | Unauthenticated, no rate limit | Unbounded Anthropic + Places spend; prod DDL | **V1** |
| 2 | **P1** `/setup` | Unauthenticated page | Confirms which other vulns are live | **V2** |
| 3 | **S6** `requestPasswordResetAction` | Unauthenticated | Account takeover (if `APP_URL` unset) | **V4** |
| 4 | **All rate-limited endpoints** | Spoofable `cf-connecting-ip` | Brute force, credential stuffing, cost abuse | **V3** |
| 5 | **A11** `/api/ai/review-edit` | Token-gated, weak limits | Unbounded AI spend | V3+V7+V14 |
| 6 | **A4** `/api/score/lookup` | Unauthenticated | Places quota exhaustion → breaks paid tenants | V3+V7+V14 |
| 7 | **B1** `/q/[slug]` | Unauthenticated, **no limit** | Row inflation, metric poisoning, free token minting | New — §2 |
| 8 | **All 23 API routes + P2/P3** | No CSP, no `frame-ancestors` | Clickjacking on the review flow | **V10** |
| 9 | **S8** `enterDemoAction` | Unauthenticated | `platform_admin` JWT (demo data only) | **V16** |
| 10 | `updateLocationGoogleAction` | Role-gated, unvalidated | Fabricated public Google rating | **V12** |

---

## 6. Non-weaponized verification

Run against **your own deployment only**. These confirm auth posture; none carry a payload or attempt exploitation.

```bash
BASE=https://your-deployment.example

# Should be 200 (public by design) — confirm the base health shape
curl -si "$BASE/api/health" | head -1

# Should be 403 — deep probes must reject anonymous callers
curl -si "$BASE/api/health?deep=1" | head -1

# Should be 401 — cron must fail closed
curl -si "$BASE/api/cron/monitor" | head -1

# Should be 401 — authenticated AI routes must reject anonymous callers
curl -si -X POST "$BASE/api/ai/reply-draft" \
  -H 'content-type: application/json' -d '{}' | head -1

# Should be 400 (missing signature) — never 200
curl -si -X POST "$BASE/api/webhooks/stripe" \
  -H 'content-type: application/json' -d '{}' | head -1

# Should be 403 (invalid signature) — never 200
curl -si -X POST "$BASE/api/webhooks/twilio/inbound" -d 'Body=STOP' | head -1

# Should be 404 — unsigned asset access must fail closed
curl -si "$BASE/api/public/content-assets/asset_1234567890abcdef12345678" | head -1

# V2 check: does /setup expose config to anonymous callers?
curl -s "$BASE/setup" | grep -oiE "AUTH_SECRET|CRON_SECRET|DATABASE_URL" | sort -u

# V10 check: do public routes carry a CSP? (expect no output = no CSP)
curl -sI "$BASE/r/test" | grep -i "content-security-policy\|x-frame-options"
```

The existing `e2e/security.spec.ts` already asserts several of these (A2 → 403, A3 → 401, A8 → 401, A15 → 404). It does **not** cover: the `setup` actions (**V1**), CSP on public routes (**V10** — its CSP test runs only on `/app` after `enterDemo`), or IP-header spoofing (**V3**). Those are the gaps to add.

---

## 7. Remediation checklist

**Immediate**

- [ ] Gate `initDbAction` / `testAiAction` / `testPlacesAction` behind `platform_admin` or `HEALTH_CHECK_SECRET`; add `consumeRateLimit` to the two provider probes — **V1** *(copy the pattern from `app/api/health/route.ts:54`)*
- [ ] Gate `/setup` behind `platform_admin`; stop rendering the raw DB error — **V2**
- [ ] Set `APP_URL` in every environment; never build auth links from request headers — **V4**
- [ ] Replace `requestIdentity()` in `lib/security/api.ts:20` **and** `lib/actions.ts:166` with trusted-proxy IP derivation — **V3**
- [ ] `npm audit fix`; add `npm audit --omit=dev --audit-level=high` to `.github/workflows/ci.yml` — **V5**

**Short term**

- [ ] Move rate-limit buckets to Redis/Upstash or Vercel KV — **V7**
- [ ] Add a rate limit + per-slug cooldown to `/q/[slug]` — §2
- [ ] Add a hard per-token lifetime budget to `/api/ai/review-edit`; add a daily Places circuit breaker to `/api/score/lookup`
- [ ] Move security headers into `next.config.ts` `headers()` so all routes get CSP + framing protection; give `/w/[slug]` a targeted `frame-ancestors` since it is meant to be embedded — **V10**
- [ ] Add `sessionVersion` to the JWT; bump on password reset and sign-out — **V8**
- [ ] Add `if (session.role !== "platform_admin") redirect("/app")` to `app/(admin)/layout.tsx` — **V9**
- [ ] Validate `GoogleLocationPatch` at the action boundary: clamp `rating` to `[0,5]`, bound `reviewCount` and all strings, constrain `placeId` format — **V12**
- [ ] Add the production guard to `lib/referrals/code.ts` — **V11**

**Backlog**

- [ ] Fail closed on missing `Origin` for state-changing requests — **V14**
- [ ] Implement or remove staff invite redemption; add token expiry either way — **V15**
- [ ] Validate `role` against a demo-permitted allowlist in `enterDemoAction` — **V16**
- [ ] Raise bcrypt cost to ≥12; add breached-password checks; implement email verification — **V17**
- [ ] Delete the dead `signInAction` alias (line 382)

---

## 8. Scope and caveats

- **Static review only.** No endpoint was called, no exploit executed, no deployment probed. The curl commands in §6 are provided for the owner to run against their own infrastructure.
- **Complete for route handlers and server actions.** All 27 route-handler files and all 48 `"use server"` exports were enumerated mechanically (`git ls-files` + `grep`) and each was opened and read.
- **Preconditions matter.** V4 requires `APP_URL` unset; V11 requires `NODE_ENV !== "production"`. Both are stated at each finding rather than assumed.
- **Not exhaustively audited:** the 3,721-line `lib/data/drizzle-provider.ts` and 1,390-line `lib/data/memory-provider.ts` were checked for raw SQL (none — all Drizzle-parameterized) and spot-checked for tenant scoping across ~15 mutations (all correctly scoped by `workspaceId`). A full line-by-line tenancy audit of both providers is the main remaining gap.
- **Not assessed:** live infrastructure, Vercel project settings, actual environment-variable values, or Google Cloud / Stripe / Twilio account-side configuration.
