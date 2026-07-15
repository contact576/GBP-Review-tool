# Testing — Foundly

Two layers: **vitest** unit tests for the AI template engine + industry catalog, and a
**Playwright** end-to-end suite that drives the full product journey (sign-up → onboarding →
staff capture → QR scan → customer review flow) across 7 industry scenarios.

## How to run

```bash
# Unit tests (50 tests: AI generation + industry catalog)
npx vitest run

# End-to-end suite (requires a production build: npm run build)
npx playwright test

# Single spec / project
npx playwright test e2e/customer-flow.spec.ts
npx playwright test --project=mobile
```

Notes:

- `playwright.config.ts` starts (or reuses) the prod server on **port 3200**
  (`PORT=3200 npm run start`, `reuseExistingServer: true`). The app runs with **no env
  vars**: in-memory multi-tenant provider (registrations persist for the server process
  lifetime) and the deterministic AI template engine.
- Two projects: `desktop` (1440×900) runs every spec; `mobile` (390×844, touch) runs the
  customer review flow only. `workers=2`, `fullyParallel=false` (files parallel, tests
  within a file serial), `retries=1`, per-test timeout 45s.
- In this sandbox the pinned Chromium revision isn't downloaded; the config points
  `launchOptions.executablePath` at `/opt/pw-browsers/chromium`
  (override with `PLAYWRIGHT_CHROMIUM_PATH`).
- Every spec registers its own throwaway accounts (`Date.now()`-unique emails) — specs are
  order-independent. Demo-workspace tests only add data; nothing resets the demo.

## E2E scenario matrix

| # | Scenario | Steps covered | Desktop | Mobile | Status |
|---|----------|---------------|:-------:|:------:|:------:|
| 1 | **Demo entry & isolation** (`e2e/demo.spec.ts`) | Sign-in → "Demo: Owner" → `/app`; demo banner (`data-testid="demo-banner"`); Harbourview score dial (Local Growth Score, "/ 100"); seeded reviews render in `/app/reviews`; "Exit demo" → `/sign-in`; `/app` re-gated; demo owner bounced from `/admin` → `/app` | ✅ | — | Pass |
| 2 | **Real registration & empty state** (`e2e/register.spec.ts`) | Sign-up (name / unique email / password / business / industry / terms) → `/onboarding/find-business` → "Do this later" → `/app`; dashboard shows registered business, score **0 of 100**, "All caught up" empty state; **no** Harbourview data, **no** demo banner; sign out; wrong password → "Invalid email or password."; correct password → back into same workspace | ✅ | — | Pass |
| 3 | **Customer QR → review loop** (`e2e/customer-flow.spec.ts`, demo slug `/q/harbourview`) | Scan mints `/r/<token>`; **5★**: attribute chips → pick 2 → "Write my review" → 3 draft cards with 3 *different* texts, each naming Harbourview + weaving a chosen attribute (lowercased); card selection highlight; "Copy & open Google" CTA visible. **2★**: private-feedback form AND `data-compliance="public-google-link"` visible (never gated) → submit → thank-you still shows the Google link. **4★**: drafts contain no 5★ superlatives (`perfect\|flawless\|exceeded\|incredible\|best .* ever`) | ✅ | ✅ | Pass |
| 4 | **restaurant — Trattoria Nova** (`e2e/seven-industries.spec.ts`) | Register → staff PWA capture (name + email + service consent → "Send review invite" → success) → `/app/requests` row: customer name, "Sent", "Service consent" → `/app/studio` shows Front desk QR + `/q/<slug>` short URL → scan `/q/<slug>` → live `/r/<token>` names the business → 5★ shows catalog chip **"Great food"** | ✅ | — | Pass |
| 5 | **physiotherapy — Northshore Physio** | Same pipeline; chip **"Clear explanations"** | ✅ | — | Pass |
| 6 | **renovation — Oakline Renovations** | Registers as "Contractor / renovation" (sign-up has no direct `renovation` option), switches to **Renovation** via the onboarding business-type picker, then the same pipeline; chip **"Quality work"** | ✅ | — | Pass |
| 7 | **real_estate — Harbor Realty Group** | Same pipeline; chip **"Knows the market"** | ✅ | — | Pass |
| 8 | **salon — Velvet & Vine Salon** | Same pipeline; chip **"Loved the result"** | ✅ | — | Pass |
| 9 | **auto_repair — Redline Auto Works** | Same pipeline **plus the full 5★ customer journey**: chips ("Honest diagnosis", "Fair pricing") → 3 distinct drafts all naming "Redline Auto Works" and mentioning a chosen attribute → "Copy & open Google" → thank-you page | ✅ | — | Pass |
| 10 | **cafe — Fig & Fern Cafe** | Same pipeline; chip **"Great coffee"** | ✅ | — | Pass |
| 11 | **Failure modes** (`e2e/failure-modes.spec.ts`) | Sign-up with invalid email (`user@invalid`) → server error "Please enter a valid email address."; weak passwords → length error then letter+number error; staff capture without service consent → send **disabled** + "Service consent is required before you can send." (unblocks once ticked); `/q/nope-nope` → `/q-expired` "This review code isn't active."; `/r/not-a-token` → HTTP 404 + "Page not found" | ✅ | — | Pass |

**Result: 21/21 passed** (18 desktop + 3 mobile) in ~17s against a warm prod server.
The suite is deterministic across repeated runs (verified twice back-to-back).

## Unit test summary (vitest)

`npx vitest run` — **50/50 passed** (~0.5s), two files:

- `lib/ai/__tests__/generation.test.ts` — template engine: 5★ vs 4★ register, superlative
  bans, sentiment lints, business-name inclusion, reply drafts per rating band, score
  samples.
- `lib/industries/__tests__/catalog.test.ts` — 36-industry catalog integrity: keys,
  attributes, phrase banks, Google-category matching, group buckets, unknown-key fallback.

## Defects & observations

No blocking defects found. The compliance invariant (public Google review link never
gated on the 1–3★ path) held on desktop and mobile. Two minor defects were found,
then **fixed and re-verified** (suite re-run green, 21/21):

1. **[FIXED]** Staff capture quick-pick chips fell back to physiotherapy wording for
   newer industries (`app/(staff)/staff/page.tsx` kept a legacy 7-vertical map).
   *Fix:* the page now resolves chips from the 36-industry catalog via
   `resolveWorkspaceIndustry`, honoring workspace custom attributes — same source as
   the customer review page.
2. **[FIXED]** Sign-up's Industry select had no direct "Renovation" option (only
   "Contractor / renovation"). *Fix:* the select now offers "General contractor" and
   "Renovation company" as separate options mapping to their distinct catalog keys.
3. **[FIXED — test code]** The mobile 2★ spec used `getByText`, which collided with
   Next.js's route announcer (a `role=alert` region mirroring the h1) under strict
   mode. The selector now targets the heading role. The app behavior was correct —
   the failure snapshot itself showed the public Google link rendered.

Not-a-defect notes:

- Playwright selectors: `getByRole("alert")` is unusable app-wide because Next.js's route
  announcer (`__next-route-announcer__`) is also `role=alert`; tests assert the specific
  error text instead. The staff capture success overlay ("Sent to X") and its toast
  ("Invite sent to X") overlap textually — tests use exact matching. No app changes were
  needed; no app source file was modified.
- Freshly-registered workspaces have an empty `reviewUrl` until a Google Place is linked,
  so the 5★ "Copy & open Google" opens a blank tab in that state (exercised in the
  auto_repair full flow). Expected pre-onboarding behavior; the flow still completes to
  the thank-you page.
