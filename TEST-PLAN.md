# Foundly — full test plan

Production: https://foundly-phi.vercel.app · DB: Supabase (ap-northeast-1) · Functions: Vercel `hnd1`

Every case is written as **Do → Expect**. A case fails if the expectation differs, *or* if the
browser console shows an error, *or* if the page takes more than ~10s.

Cases tagged **[BLOCKED]** cannot pass until a config gap is closed — see §0. Do not report those as
bugs; they are known and listed with what unblocks them.

---

## 0. Known blockers (verify these first — they invalidate whole sections)

| # | Gap | Effect | Unblock |
|---|---|---|---|
| B1 | `RESEND_API_KEY` not set in production | No review-request email ever leaves the system. Requests are created and honestly shown as "queued — connect email to send" | Add Resend key + `EMAIL_FROM`, verify sending domain |
| B2 | `TWILIO_*` not set | SMS channel inert | Add SID, auth token, messaging service SID |
| B3 | `STRIPE_SECRET_KEY` / price IDs not set | No checkout, no upgrade, no real plan enforcement | Add Stripe keys + webhook secret + price IDs |
| ~~B4~~ | ~~`ANTHROPIC_API_KEY` not set~~ — **closed 2026-08-07.** The key *is* set in Production (confirm with `npx vercel env ls production`), so the Claude path runs. A draft still returning `source: "template"` now means generation failed open, not a missing key | — |
| B5 | Business Profile API not enabled/approved | No review import, no reply publishing, no performance data. **Since 2026-08-04 this no longer blocks the profile score or the recommendation list** — `syncGooglePublic` runs a Places-backed audit (10 checks: website, phone, hours, photos, description, categories, review volume/recency/rating, listing status) that produces a real score and real next actions. Checks Places cannot see (posts, Q&A, review replies, services, special hours) are shown as blocked, never as passing | Enable My Business APIs; request per-project access |
| B6 | OAuth consent screen unverified for `business.manage` | Only test users can connect; real customers cannot | Submit Google verification |
| B7 | OAuth client is the shared PPC Guru client | Consent screen asks for Gmail/Drive/Ads scopes; Foundly holds far more access than it needs | Create a dedicated client with only `business.manage` + `webmasters.readonly` |

---

## 1. Automated — run these first

```bash
npm run check                 # lint + typecheck + 132 tests + build
npm run db:verify             # connectivity, 27 tables, auth columns, real account round trip
node crawl-check.mjs  https://foundly-phi.vercel.app <email> '<pass>'   # 62 routes
node loop-check.mjs   https://foundly-phi.vercel.app <email> '<pass>'   # ASK -> rate -> route
node feature-check.mjs https://foundly-phi.vercel.app <email> '<pass>'  # rank grid, QR, widget, /score
node live-check.mjs   https://foundly-phi.vercel.app                    # real signup on the live site
```

**Status (2026-08-07): all five have now been run and pass.**

| Check | Result |
|---|---|
| `npm run check` | Pass — lint, typecheck, **181 tests**, build (92 pages) |
| `crawl-check` | Pass — 62 routes |
| `loop-check` | **Pass — the core loop in §4 is now verified end to end**, both the 5★ Google path and the 2★ private-feedback path, each read back from Postgres |
| `live-check` | Pass — real signup, real Places lookup, real review sync, security headers |
| `feature-check` | Pass — QR redirect, widget, rank grid, `/score` |

Two things had to be fixed to get there, and both were *checker* faults rather than product faults —
worth knowing, because each one had been reporting a product bug that did not exist:
`loop-check` never cleared the service step or the post-rating **Continue**, so it never reached the
stars or the drafts; and `feature-check` filled the `/score` field but never pressed the button, so no
lookup ever ran. Chasing the second one is what uncovered the real bug below.

---

## 2. Auth & session

| # | Do | Expect |
|---|---|---|
| A1 | Sign up with a new email | Lands in onboarding; row in `app_user`; workspace + location + subscription created together |
| A2 | Sign up again with the same email | Refused: "An account with this email already exists" |
| A3 | Submit sign-up twice very fast (double-click) | Only one account. DB partial unique index on `lower(email)` enforces it, not just the UI |
| A4 | Sign in, correct password | Reaches `/app` |
| A5 | Sign in, wrong password | Rejected; no hint about whether the email exists |
| A6 | Submit the sign-in form before JS hydrates | Never a GET — password must not appear in the URL bar (`method="post"`) |
| A7 | Forgot password → open emailed link | Reset works once; the same link fails the second time |
| A8 | Reset link after expiry | Refused |
| A9 | Sign out, then press Back | No authenticated content; redirected to `/sign-in` |
| A10 | Change password, then use an old session in another browser | Old session invalidated (`session_version` bump) |
| A11 | Tamper with the session cookie (edit one character) | Treated as signed out, no 500 |
| A12 | Sign in as owner, visit `/admin` | Redirected to `/app`, no admin data |
| A13 | Sign in as owner, visit `/agency` | Redirected to `/app` |
| A14 | Visit `/setup` as a non-platform-admin | 404 (deliberate — must not reveal it exists) |

## 3. Onboarding

| # | Do | Expect |
|---|---|---|
| O1 | Walk all steps: business-type → find-business → connect → channels → team → qr-kit → finish | Each step saves; Back preserves entries |
| O2 | Search a real business in find-business | Live Google Places results; selecting one fills name/address/rating/review count |
| O3 | Search nonsense text | Honest empty state, no crash |
| O4 | Skip Google connect | Onboarding still completes; integration shows "disconnected", not a fake success |
| O5 | Finish onboarding | `/app` shows the real business name and real rating from Places |
| O6 | Re-enter onboarding after finishing | Does not duplicate the workspace or location |

## 4. Core loop — the product's reason to exist

| # | Do | Expect |
|---|---|---|
| C1 | Add a customer with consent ticked | Row in `customer`; consent recorded in `customer_consent` |
| C2 | Add a customer **without** consent | Cannot send a request to them — blocked with a clear reason |
| C3 | Send a review request | Row in `review_request` with a unique token **[B1: status stays "queued", no email sent]** |
| C4 | Open the request token URL in a clean browser (no session) | Service question for the right business, then rating, then suggested wording |
| C4b | Scan a QR on a host other than the configured app URL (e.g. a preview deploy) | Stays on that host. Regression: `/q/<slug>` used to redirect to `appUrl()`, which is `localhost:3000` when unset — every scan left the app |
| C5 | Rate **5 stars** | Routed onward to the real Google review URL for that location |
| C6 | Rate **4 stars** | Same Google path |
| C7 | Rate **2 stars** | Private feedback form — must **not** push to Google |
| C8 | Submit private feedback | Stored in `private_feedback`, visible to owner, never published |
| C9 | Reuse the same token twice | Second use refused or shows already-completed, never double-counts |
| C10 | Open an expired token | `/q-expired` state, no crash |
| C11 | Guess/alter a token by one character | Not found — no enumeration |
| C12 | Send during configured quiet hours | Held, not delivered immediately |
| C13 | Owner views `/app/requests` | The request appears with an accurate status |

**This is the single most important section. Verified end to end on 2026-08-07** by `loop-check`
against production: customer created, request + token written, token opened in a clean browser,
5★ routed to the real Google URL, 2★ stored in `private_feedback` while still being offered the public
Google link, and both ratings recorded back onto the request row. C3 confirmed: with no Resend key the
request row lands as `status=failed`, not a fake success.

## 5. Reviews & replies

| # | Do | Expect |
|---|---|---|
| R1 | `/app/reviews` | Real reviews for the location; nothing invented |
| R2 | Filter to "needs reply" | Only unreplied reviews |
| R3 | Draft an AI reply | Draft appears **[B4: template-sourced, must be labelled honestly, not passed off as AI]** |
| R4 | Edit and save a reply | Persists; survives reload |
| R5 | Publish a reply | **[B5: must fail honestly with the real reason, not a fake success]** |

## 6. QR, short links, widget

| # | Do | Expect |
|---|---|---|
| Q1 | `/app/studio` → generate QR kit | Downloadable asset containing a working URL |
| Q2 | Scan/open the QR target `/q/<slug>` | Lands on the rating flow for the right location |
| Q3 | Open `/q/<bad-slug>` | Clean not-found, no 500 |
| Q4 | Hammer a QR link ~50× quickly | Rate-limited / abuse-guarded, not unbounded |
| Q5 | `/w/<slug>` embeddable widget | Renders standalone; safe to iframe |
| Q6 | Staff QR at `/staff/qr` | Attributes the request to that staff member |

## 7. Consoles

| # | Do | Expect |
|---|---|---|
| D1 | `/app` dashboard | Score, stats and trends all trace to real rows; no placeholder numbers |
| D2 | `/app/this-week`, `/milestones`, `/notifications` | Consistent with the same underlying data |
| D3 | `/app/analytics`, `/benchmark`, `/visibility`, `/rank-grid` | Charts render; single-data-point cases do not break |
| D4 | `/app/report` | Renders fully (regression: this was blank until 2026-07-27) |
| D5 | `/app/campaigns` → create a campaign | Saves and appears in the funnel |
| D6 | Staff console + leaderboard | Only that staff member's scope; leaderboard respects the visibility setting |
| D7 | Agency console as an agency account | Client rollup loads (regression: `/agency`, `/agency/clients`, `/agency/reports` used to time out) |
| D8 | Platform admin pages as a real platform admin | Tenants, billing, delivery, fraud, audit all load |
| D9 | Sign in as agency_admin or platform_admin, then navigate to `/app/*` and click any action button | Redirected to `/agency` / `/admin`. Regression 2026-08-07: `/app` was the only protected prefix with no role gate, so both roles loaded every page at HTTP 200 and then hit a **500 on every server action** — `requireRole()` throws, and an uncaught throw in a server action is a 500, not a redirect. Nine pages affected. Owner/manager/staff were never affected |

## 8. Settings

| # | Do | Expect |
|---|---|---|
| S1 | Business settings — change name/website | Persists; reflected across the app |
| S2 | Channels — toggle email/SMS | **[B1/B2: must show "not configured", never a fake enabled state]** |
| S3 | Consent settings — change defaults | Applied to newly added customers |
| S4 | Team — invite a member | Invite created; accepting grants only the intended role |
| S5 | Locations — add a second location | Isolated data; switching locations changes what you see |
| S6 | Integrations — Connect/Reconnect Google | Real OAuth; status reports Google's actual error **[B5/B6]** |
| S7 | Billing | **[B3: no live checkout — must not imply a working purchase]** |

## 9. Security (re-test after any auth change)

| # | Do | Expect |
|---|---|---|
| X1 | As tenant A, request tenant B's IDs (customer, review, request, location) by editing URLs/payloads | Denied every time — no cross-tenant read or write |
| X2 | Call owner-only server actions as a staff account | Denied |
| X3 | Hit `/api/health?deep=1` with no secret | 403 |
| X4 | Hit `/api/cron/monitor` without the bearer token | 401/403 |
| X5 | Password-reset link host | Always the app's own origin — never influenced by a forged `Host` header |
| X6 | Brute-force sign-in ~20× | Rate-limited |
| X6b | Burn the sign-in limit against someone else's email, then have them sign in with the **correct** password from a different browser | They get in. Regression 2026-08-07: the strict bucket was keyed on the email alone, so 10 wrong guesses locked the real owner out for the full 10-minute window from anywhere — a brute-force guard usable as a lockout weapon. Now keyed on email + caller |
| X6c | Sign in on a throttled connection, typing before the page hydrates | Signs in. Regression 2026-08-07: the auth forms are controlled off state that starts empty, and the submit handler read state, so anything typed pre-hydration was discarded — "Invalid email or password" for a correct password, and a rate-limit slot burnt each time. All four auth forms now read FormData with state as fallback |
| X7 | Inspect cookies | Session cookie `httpOnly`, `secure`, `sameSite` |
| X8 | Submit XSS payloads in customer name, feedback, reply text | Escaped everywhere it is rendered |
| X9 | Check any page source for secrets | Only `NEXT_PUBLIC_*` values ever reach the client |

## 10. Public pages, performance, accessibility

| # | Do | Expect |
|---|---|---|
| P1 | `/`, `/pricing`, `/agencies`, `/resources`, `/for/plumbing`, `/legal/*` | Render; no console errors |
| P2 | `/score` — run a real lookup | Live Google-backed result |
| P2b | `/score` — type a business but leave the category select alone | The result is that business, or an honestly-labelled estimate — **never a different business's real rating.** Regression 2026-08-07: the select defaulted to `Physiotherapy` and was appended to the Places query, so "Priority Plumbing & Drains Toronto" returned *Tru Physiotherapy* (5.0, 87 reviews) presented as "from your public Google listing" |
| P2c | `/score` — type a name matching nothing real | Falls back to the labelled synthetic preview, never a stranger's listing |
| P3 | `robots.txt`, `sitemap`, OG tags | Present and correct |
| P4 | Any dashboard page, timed | Under ~3s. Cross-region DB makes this the weak spot |
| P5 | Whole app at 375px width | Usable; tap targets ≥44px |
| P6 | Keyboard-only navigation | Focus visible, nothing unreachable |
| P7 | Dark mode / reduced motion | Respected |

## 11. Data integrity & jobs

| # | Do | Expect |
|---|---|---|
| J1 | Trigger `/api/cron/monitor` with the correct secret | Completes; writes a `monitoring_run` |
| J2 | Kill a request mid-signup (close the tab) | No half-created tenant — the transaction rolls the whole thing back |
| J3 | Reconnect Google twice in a row | One credential row, not duplicates |
| J4 | Delete a customer with history | Referential integrity holds; no orphan rows |

---

## What to fix, in order

1. **B1 — email.** Without it the product cannot deliver its core action. Everything else is decoration.
2. **B5/B6 — Business Profile access.** Review import and reply publishing are the value proposition; both are weeks of lead time, so start now.
3. ~~**Run `loop-check`, `feature-check`, `live-check`.**~~ Done 2026-08-07 — all pass, core loop verified.
4. **B3 — Stripe.** No revenue until this is live.
4b. **Two open low-severity items** from the 2026-08-07 audit, both deliberately left alone:
    `notFound()` called inside a route group (`/r/<bad-token>`, `/legal/<bad-doc>`, `/resources/<bad-slug>`)
    returns a correct 404 whose *server-rendered* body is an empty suspense placeholder — browsers fill in
    the right 404 card, but crawlers and no-JS clients get a blank page; and `/for/<any-slug>` returns 200
    with a generic fallback rather than 404, which mints unlimited indexable duplicate URLs.
5. **B7 — dedicated OAuth client.** A review tool asking for Gmail and Drive will cost you signups, and holding that access is a liability.
6. ~~**Region mismatch.**~~ Fixed — `vercel.json` pins `"regions": ["hnd1"]`, beside Supabase. Confirm the Vercel dashboard agrees; if the two disagree, the dashboard wins.
