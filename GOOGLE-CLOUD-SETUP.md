# Foundly — Google Cloud Project Setup Runbook

Everything required to point Foundly at a **new** Google Cloud project, in execution order.
Derived from the code, not from docs: `lib/google/*`, `app/api/auth/google/*`, `app/api/google/connect/*`.

---

## 0. Facts you need before starting

| Thing | Value |
|---|---|
| Repo | `D:\Website and Application working on\GBP-Review-tool` (branch `shrikaanth-update`) |
| Production URL | `https://foundly-phi.vercel.app` |
| Vercel project | `foundly` under team `shri-s-projects9` |
| Local dev URL | `http://localhost:3000` |
| Env vars to replace | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_MAPS_API_KEY` |
| Demo login for tests | `demo@foundly.local` / `FoundlyDemo2026x` |

Two independent Google surfaces, one OAuth client:

- **Login** — `/api/auth/google` → `/api/auth/google/callback`, scopes `openid email profile`, `access_type=online`. Non-sensitive. Works immediately.
- **GBP connect** — `/api/google/connect` → `/api/google/connect/callback`, scopes `business.manage` + `webmasters.readonly`, `access_type=offline&prompt=consent`. Sensitive/restricted. Blocked until access approval.

---

## Phase A — Create the project and attach billing

1. Cloud Console → **Create Project**. Name it something identifiable (e.g. `foundly-prod`).
2. Record the **Project ID** and **Project Number** — the access request form in Phase C needs the number.
3. **Billing → Link a billing account.** Not optional: Places API (New) hard-fails on an unbilled project, and the failure looks like a generic error rather than a billing error.

---

## Phase B — Enable APIs (API Library)

Enable all seven. Six are searchable today; the seventh is not (see note).

| Console name | Host | What breaks without it |
|---|---|---|
| **Places API (New)** | `places.googleapis.com` | `/score` lookup, business search, rank grid |
| **My Business Account Management API** | `mybusinessaccountmanagement.googleapis.com` | listing the user's GBP accounts |
| **My Business Business Information API** | `mybusinessbusinessinformation.googleapis.com` | profile read + profile edits |
| **My Business Q&A API** | `mybusinessqanda.googleapis.com` | questions / answers |
| **Business Profile Performance API** | `businessprofileperformance.googleapis.com` | insights + metrics |
| **Google Search Console API** | `searchconsole.googleapis.com` | the `webmasters/v3` calls behind `webmasters.readonly` |
| **Google My Business API** (legacy v4) | `mybusiness.googleapis.com` | reviews, review replies, local posts |

**Note on the last one:** the v4 API does not appear in the API Library until your Business Profile access request is approved. Skip it now, come back after Phase C clears.

**Note on the middle five:** they enable instantly but ship with **zero quota** until approval, so they will enable successfully and still return 403. That is expected, not a misconfiguration.

---

## Phase C — Request Business Profile API access (do this FIRST, it's the long pole)

1. Go to <https://developers.google.com/my-business/content/prereqs>.
2. Submit the **Business Profile APIs access request form** with the new Project Number from Phase A.
3. Wait **1–2 weeks**. Everything else in this runbook takes about 30 minutes.

Until this clears, the app degrades honestly by design: `fetchGoogleProfile` short-circuits to
`{ ok: true, pendingApproval: true }`, `location.gbp_snapshot` stays NULL, and the product runs
entirely on the Places-derived audit.

---

## Phase D — OAuth consent screen (new console: "Google Auth Platform")

The console renamed this. Old path: *APIs & Services → OAuth consent screen*. New path: *Google Auth Platform → Branding / Audience / Data Access / Clients*.

1. **Audience:** External.
2. **Branding:** app name, user support email, logo, developer contact email, privacy policy URL, terms of service URL.
3. **Data Access → Add scopes:**
   - `openid`
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
   - `https://www.googleapis.com/auth/business.manage` — **restricted**
   - `https://www.googleapis.com/auth/webmasters.readonly` — **sensitive**
4. **Stay in Testing mode.** Add yourself and each pilot client as a **test user** (100 max, by email).

### The verification trade-off — read before deciding

| | Testing mode | Published + verified |
|---|---|---|
| Who can sign in | only listed test users | anyone |
| Refresh token lifetime | **expires after 7 days** | indefinite |
| Consent screen | "Google hasn't verified this app" warning | clean |
| Requires owned domain | no | **yes** |
| Timeline | instant | weeks (restricted scope → possible security assessment) |

The 7-day refresh token expiry in Testing mode means every connected workspace must **reconnect weekly**. Acceptable for pilots, not for real customers.

`vercel.app` is on the Public Suffix List, so Google will most likely reject it as an Authorized Domain. **You need a real owned domain before you can submit for verification.** Adding a custom domain also changes `VERCEL_PROJECT_PRODUCTION_URL`, which silently breaks the redirect URIs — set `NEXT_PUBLIC_APP_URL` in Vercel at that moment to pin the origin.

---

## Phase E — Credentials

### E1. OAuth 2.0 Client ID → **Web application**

Authorized redirect URIs — all four, exactly, no trailing slash:

```
http://localhost:3000/api/auth/google/callback
http://localhost:3000/api/google/connect/callback
https://foundly-phi.vercel.app/api/auth/google/callback
https://foundly-phi.vercel.app/api/google/connect/callback
```

Authorized JavaScript origins: leave empty. Both flows are server-side redirects; there is no browser-side Google SDK in the codebase.

Copy the client ID → `GOOGLE_CLIENT_ID`, secret → `GOOGLE_CLIENT_SECRET`.

### E2. API key → `GOOGLE_MAPS_API_KEY`

- **API restrictions:** restrict to **Places API (New)** only.
- **Application restrictions:** **None.**

That second one is a deliberate trade-off, not laziness. The key is used only server-side from Vercel functions on rotating IPs, so IP allowlisting is impossible and an HTTP-referrer restriction would do nothing (there is no client-side Maps usage anywhere in `app/` or `components/`). The mitigation is the API restriction plus a **budget alert** on the billing account — set one.

---

## Phase F — Environment variables

Local (`.env.local`):
```
GOOGLE_CLIENT_ID=<new>
GOOGLE_CLIENT_SECRET=<new>
GOOGLE_MAPS_API_KEY=<new>
```

Production:
```bash
npx vercel env ls production                    # see what is currently set
npx vercel env rm GOOGLE_CLIENT_ID production
npx vercel env add GOOGLE_CLIENT_ID production
# repeat for GOOGLE_CLIENT_SECRET and GOOGLE_MAPS_API_KEY
npx vercel --prod --yes                          # redeploy — env changes need a new build
```

Leave `NEXT_PUBLIC_APP_URL` unset. `appUrl()` resolves from `VERCEL_PROJECT_PRODUCTION_URL`, which keeps the redirect URI stable across deploys.

---

## Phase G — Clear stale credentials (mandatory)

Refresh tokens are issued **per OAuth client**. Every row in `google_credential` was minted by the old client ID and becomes permanently unrefreshable the moment you swap credentials. Left in place, the UI shows "connected" and then fails on every refresh.

```sql
TRUNCATE TABLE google_credential;
```

Every workspace then has to reconnect via `/api/google/connect`. Tell affected users before you do it.

---

## Phase H — Verify

```bash
npm run check                                    # lint + typecheck + tests + build
npm run db:verify                                # connectivity, 27 tables, real account round trip
node crawl-check.mjs https://foundly-phi.vercel.app demo@foundly.local FoundlyDemo2026x
node loop-check.mjs                              # ASK → rate → route loop
node feature-check.mjs
node live-check.mjs
```

Then by hand:
1. `/sign-in` → **Continue with Google** → completes and lands in `/app`. *(Should work immediately — non-sensitive scopes.)*
2. `/score` → type a real business name → returns the correct listing, not a stranger's. *(Places key + billing.)*
3. `/app/settings` → **Connect Google Business Profile** → consent completes, then shows the pending-approval state. *(Expected until Phase C clears.)*

If one of these fails on a page you can drive by hand, **suspect the checker before the product** — `loop-check` and `feature-check` have both had bugs of their own.

---

## Failure decoder

| Symptom | Cause | Fix |
|---|---|---|
| `Error 400: redirect_uri_mismatch` | URI missing from Phase E1 | add the exact URI, no trailing slash |
| Redirect to `/sign-in?error=google_not_configured` | `GOOGLE_CLIENT_ID` or `SECRET` unset in that environment | Phase F, then redeploy |
| 403 `SERVICE_DISABLED` / `has not been used in project` | API not enabled | Phase B — takes effect immediately |
| 403 `PERMISSION_DENIED` on My Business hosts | project not approved | Phase C — wait |
| Places returns nothing / billing error | no billing account | Phase A step 3 |
| Score shows a stranger's rating | `isPlausibleNameMatch` bypassed | any caller of `searchBusinesses` presenting a result as the user's own listing needs that guard |
| Connect succeeds, later refreshes fail | Testing-mode 7-day token expiry, or stale `google_credential` rows | reconnect; Phase G |
| Drafts come back `source: "template"` | `ANTHROPIC_API_KEY` missing — generation fails open | unrelated to Google; check `npx vercel env ls production` |

`lib/google/gbp.ts:867` (`classifyError`) already separates "not enabled" from "not approved" and carries Google's own message through to the UI, so read the actual detail string rather than guessing.

---

## What stays broken until Phase C is approved

- Reviews, review replies, local posts (legacy v4 API not enableable yet)
- Structured GBP **services** — the Places API does not expose them at all
- The profile audit is limited to the ~10 signals Places exposes
- `location.gbp_snapshot` stays NULL for every workspace

Unaffected and fully working from day one: Google login, `/score`, business search, rank grid, and every non-Google feature.
