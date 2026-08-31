# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run check        # canonical gate: lint -> typecheck -> test -> build. Run before committing.
npm run dev          # dev server on :3000
npm run typecheck    # tsc --noEmit
npm test             # vitest run (all unit/integration)
npm run lint         # eslint . --max-warnings=0  (warnings fail)
npm run build        # next build
```

Single test file / single test:

```bash
npx vitest run lib/reviews/__tests__/matching.test.ts
npx vitest run -t "vanish detection"
```

Browser tests (Playwright starts its own optimized server on :3200 with the in-memory provider):

```bash
npx playwright test
npx playwright test e2e/customer-flow.spec.ts --project=desktop
```

In sandboxed/CI environments where the pinned Playwright browser isn't on disk, point at the preinstalled binary — the config already honours it:
`PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test`

Database: `npm run db:generate` / `db:push` / `db:seed`.

Vitest only collects `**/__tests__/**/*.test.ts`. `server-only` is aliased to a stub (`test/server-only-stub.ts`) so server modules containing pure helpers stay unit-testable.

## The honesty laws (the defining constraint of this codebase)

This product's positioning is that its numbers are real. A large amount of the code exists specifically to prevent fabricated data reaching a user, and several past bugs were exactly that. Treat these as non-negotiable:

- **Never invent a metric.** If a value cannot be derived from real data, omit it or render an explicit "not measured / not checked / couldn't verify" state. Never substitute a plausible default, a seeded PRNG, or a zero that reads as healthy. Distinguish *measured-zero* from *not-measured* everywhere.
- **Never claim causation or customers gained.** Frozen microcopy lives in `lib/compliance/microcopy.ts`; an `attribution_dishonesty` lint enforces it. Say "people who found you / contacted you / new reviews".
- **Attribution is inference, never certainty.** Review↔request matching (`lib/reviews/matching.ts`) produces a confidence score capped below 1.0 so stored values can only support "detected / likely matched".
- **The public Google review link is never gated.** `components/review/PublicGoogleReviewLink.tsx` carries `data-compliance="public-google-link"` and is rendered unconditionally on every branch of the customer flow, including 1–3★. Do not wrap it in a conditional.
- **Dual consent** — service and marketing are separate persisted flags (`lib/compliance/consent.ts`). Marketing sends filter to opted-in only; unsubscribe flips marketing without killing service consent.
- **The Google business name is never written automatically** — `lib/compliance/lints.ts` `assertNotNameField` is enforced at the mutation choke point; keyword-stuffing a profile name risks suspension.
- **No emoji in app UI** — use the `Icon` set. Tabular numerals on all figures.

If a UI string promises behaviour, verify the code performs it. Several bugs have been the UI promising something the implementation never did.

## Architecture

**Next.js 15 App Router**, React 19, TypeScript (`strict` + `noUncheckedIndexedAccess`), Tailwind, Drizzle + Neon Postgres.

### Route groups (`app/`)
Each is a distinct audience with its own shell: `(marketing)` public site + free score · `(auth)` · `(onboarding)` · `(app)` owner product · `(staff)` capture PWA · `(customer)` public tokenized review flow + embeddable widget · `(agency)` white-label console · `(admin)` internal platform console. Plus `app/api/**` and `app/q/[slug]` (dynamic QR redirect).

### Data layer — the most important thing to understand
`lib/data/provider.ts` defines a single `DataProvider` interface with **two full implementations that must stay behaviourally identical**:

- `lib/data/memory-provider.ts` — in-memory, seeded demo workspace (`ws_harbourview`)
- `lib/data/drizzle-provider.ts` — Postgres

**Any provider method you add or change must be implemented in both, with matching semantics and side effects** (counter bumps, audit rows, notifications, consent filtering). Divergence between them is a recurring source of bugs.

Selection (`lib/data/index.ts`): demo sessions **always** use memory; real sessions use Drizzle when `DATABASE_URL` is set, else memory. `getRealProvider()` exists for pre-session auth flows — using the wrong one here previously caused accounts to be written to memory and never found again.

Every scoped method takes a `workspaceId` resolved server-side. Domain types live in `lib/data/types.ts`; `FoundlyData` is the per-workspace aggregate.

### Governed Google write pipeline
Nothing writes to Google without passing through this chain:

`profile-sync` snapshot → `lib/audit/engine.ts` findings → `lib/suggestions/inbox.ts` suggestions → exact preview generated → **explicit owner approval** (`lib/compliance/product-policy.ts` `assertApprovedForExecution`) → idempotent job row written *before* the call → `lib/google/{profile-mutation,mutation-runner,content-publishing,content-publish-runner}.ts` executes → **independent read-back verification** → audit-log row.

Reuse this chain; do not add a second write path. Outcomes are surfaced honestly, including "Google accepted it but we could not read it back yet" rather than rounding up to success.

### Ready-but-inactive integrations
Stripe, Resend, Twilio, OpenAI/Anthropic, Google, Upstash are all coded end-to-end and gated on their env vars. Without keys the feature must report exactly what is missing and do nothing — never simulate success. Follow the pattern in `lib/billing/stripe.ts` and `lib/email/index.ts`. Adding a real transport or SDK dependency is usually unnecessary: Stripe and Upstash are talked to over plain `fetch`.

### Other load-bearing modules
`lib/actions.ts` (all server actions; `scoped()` does RBAC + tenant resolution) · `lib/compliance/**` (lints, consent, quiet hours, product policy) · `lib/reviews/{durability,matching}.ts` (vanish diff + attribution) · `lib/campaigns/**` · `lib/aeo/**` (AI-visibility; the model is asked only for its natural answer, and the verdict is derived deterministically from that literal text) · `lib/security/api.ts` (rate limiting) · `lib/monitoring/runner.ts` (daily cron).

## Gotchas

- **`"use client"`** — any file with `onClick`/`onChange`/hooks needs it, or `next build` fails at prerender with "Event handlers cannot be passed to Client Component props". `typecheck` will not catch this; `build` will.
- **Vercel Hobby allows daily crons only.** Entries in `vercel.json` must use a daily schedule; an hourly one causes the deploy to be rejected outright. Note the campaign cron is deliberately not at 06:00 UTC — that is 1–3am in North America and would put every SMS into a permanent quiet-hours hold.
- **Design system** — `DESIGN.md` is the binding contract. Semantic tokens only (never raw hex), gold is rationed to earned celebration, two shadow levels, light-first (no dark mode).
- `awesome-design-md/` is a vendored third-party reference library, not application code.

## Known staged-but-inert work

Do not assume these are active:

- **Postgres RLS** (`lib/db/rls.ts`, `schema-sql.ts`) is written and verified but **default-off** behind `FOUNDLY_ENABLE_RLS`, and **no caller uses it**. Tenant isolation is currently enforced by application code only. Real enforcement additionally requires switching `neon-http` → `neon-serverless`, because the HTTP driver cannot carry session GUCs.
- **Rate limiting** falls back to per-instance in-memory counting without `UPSTASH_REDIS_REST_URL`/`_TOKEN`, which on serverless is not fleet-wide enforcement. It logs this rather than implying protection.
- **GBP write access** is gated on Google's per-project API approval; the code is complete and unit-tested but live-untested.

## Reference docs

`README.md` (product + env matrix) · `SETUP.md` (click-by-click provider setup) · `TESTING.md` (suite inventory) · `DESIGN.md` (design contract) · `DESIGN-MAKEOVER.md` (cross-brand design spec).
