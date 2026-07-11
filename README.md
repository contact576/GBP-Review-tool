# Foundly

**Get found and get chosen.** Foundly is an AI-powered **Local Growth Platform** for local businesses — a steady stream of durable Google reviews, an optimized Google Business Profile, competitor benchmarks, campaigns, and an agency white-label channel, all wired to one honest flywheel:

> **ASK → REVIEWS → OPTIMIZED PROFILE → RANK → NEW CUSTOMERS → COME BACK**

Built with Next.js 15 (App Router), React 19, TypeScript, Tailwind, and Drizzle/Postgres. Ships fully interactive with **zero configuration** and deploys to Vercel out of the box.

---

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. The app runs immediately with a seeded demo tenant — **Harbourview Physiotherapy** — in ephemeral in-memory "Demo mode" (no database required).

- **Marketing / free Growth Score:** `/`, `/score`, `/pricing`
- **Sign in / enter the demo:** `/sign-in` → one-click "Enter as Owner / Agency / Admin"
- **Owner app:** `/app` (dashboard, this-week Co-Pilot, reviews, requests, customers, campaigns, benchmark, analytics, AI Visibility, rank grid, QR studio, growth report, settings)
- **Staff capture PWA:** `/staff`
- **Customer review page:** `/r/demo` (the seeded live token)
- **Agency portal:** `/agency` · **Internal admin:** `/admin`
- **Health probe:** `/api/health` → `{ ok, aiKeyed, dbBacked }`

## Configuration (all optional)

Every environment variable is optional. Copy `.env.example` to `.env` and set what you want.

| Variable | Effect when set |
|---|---|
| `ANTHROPIC_API_KEY` | Enables **live AI** generation (review drafts, replies, campaign copy, report narration). Without it, high-quality deterministic templates are used — every AI feature still works. |
| `FOUNDLY_AI_MODEL` | Override the model (default `claude-haiku-4-5-20251001`, chosen for lean cost). |
| `DATABASE_URL` | Switches persistence to **real Postgres** (Neon/Supabase/any Postgres) via Drizzle. Without it, seeded in-memory demo data is used. |

### Enable real persistence (2 minutes)

1. Create a free Postgres database at <https://neon.tech> and copy the connection string.
2. Set `DATABASE_URL` (locally in `.env`, or in Vercel → Project → Settings → Environment Variables).
3. Push the schema and seed the demo tenant:

```bash
npm run db:push
npm run db:seed
```

Data now persists across reloads and instances.

### Enable live AI

Set `ANTHROPIC_API_KEY` in your environment (locally or on Vercel). No code change needed — the AI routes detect the key and switch from templates to live generation automatically.

## Deploy to Vercel

Framework preset **Next.js**, default build (`next build`). No env vars are required for a working deploy. Add `DATABASE_URL` and `ANTHROPIC_API_KEY` later to unlock persistence and live AI.

## What's real vs simulated

**Real & working:** every screen and UI flow, the full review loop, AI generation (keyed) + templates, compliance enforcement (non-gated public review link on 1–3★, dual consent, no business-name edits, honesty microcopy), Drizzle/Postgres persistence + seed, CSV export, mobile-first responsive design.

**Simulated behind clean interfaces (swap for real integrations in Phase 1.5+):** Google OAuth / GBP / Places API, Stripe billing, Twilio/Resend real sends, live SERP rank data, live AEO probing, A2P registration. These render realistic seeded data and mock success paths.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:push` | Push Drizzle schema to `DATABASE_URL` |
| `npm run db:seed` | Seed the Harbourview demo tenant into Postgres |

## Architecture

- **`lib/data`** — domain types, the `DataProvider` interface, the in-memory + Drizzle providers, the seed, and derived-metric selectors. `getDataProvider()` picks Postgres when `DATABASE_URL` is set, otherwise the seeded memory provider.
- **`lib/ai`** — the AI service (Anthropic when keyed, deterministic templates otherwise) behind `/api/ai/*` routes; every output passes the compliance lints.
- **`lib/compliance`** — the structural backstop: lints (no name-stuffing / no incentives / attribution honesty / no fabricated specifics), dual-consent guards, and frozen honesty microcopy.
- **`components`** — the Foundly design system: `ds` primitives, hand-rolled SVG `charts`, `app` shell + widgets, `review` surfaces (including the compliance-critical `PublicGoogleReviewLink`), and a ~30-icon stroked set.
- **`app`** — route groups for marketing, auth, onboarding, the owner app, the staff PWA, the customer review page, the agency portal, and the internal admin console.

_Not legal advice. Compliance controls are engineering requirements; consult qualified counsel per jurisdiction before launch._
