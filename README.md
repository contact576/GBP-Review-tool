# Foundly

**Get found and get chosen.** Foundly is an AI-powered **Local Growth Platform** for local businesses — a steady stream of genuine Google reviews, an optimized Google Business Profile, honest analytics, campaigns, and an agency white-label channel, running one flywheel:

> **ASK → REVIEWS → OPTIMIZED PROFILE → RANK → NEW CUSTOMERS → COME BACK**

Built with Next.js 15 (App Router), React 19, TypeScript, Tailwind, and Drizzle/Postgres. Deploys to Vercel with **zero required configuration**; every credential unlocks a real capability (see `SETUP.md`).

---

## What's real (v2)

- **Real accounts** — email + password (bcrypt) and Google sign-in, JWT sessions, role-gated consoles. New accounts start **empty** with guided setup; the sample business ("Harbourview Physiotherapy") is an explicitly-labeled **demo workspace**, never mixed with real data.
- **Working QR codes** — every code encodes `{your-app}/q/{slug}`; a scan mints a fresh review session, logs the scan, credits the staff member, and lands the customer in the review flow. Real PNG/SVG downloads and a print kit.
- **Rating- and industry-aware AI** — 36-industry catalog drives review drafts that always match the star rating (a 4★ never gushes like a 5★), the industry's voice, the service received, and the selected attributes. A sentiment-consistency lint blocks mismatches; with `ANTHROPIC_API_KEY` set, drafts are genuinely AI-written (and still lint-gated).
- **Real Google integration** — Places business search in onboarding (real place IDs → real Google review links), Google sign-in, and a Business-Profile connect flow that stores encrypted tokens and honestly reports Google's per-project API approval status.
- **Multi-tenant persistence** — with `DATABASE_URL` set, everything is stored per-workspace in Postgres with workspace-scoped queries throughout.
- **Honest states everywhere** — integrations show real connection status; features that need an unconnected service say so instead of pretending; the compliance invariants (never gate the public Google review link on low ratings, dual service/marketing consent, never edit a business name on Google) are enforced in code.

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

- **Try the demo:** `/sign-in` → "Explore the demo" (labeled, resettable, isolated)
- **Create a real account:** `/sign-up` (works keyless; persists when `DATABASE_URL` is set)
- **Customer review flow:** scan any QR from Studio, or visit `/q/harbourview` in the demo
- **Staff capture:** `/staff` · **Agency:** `/agency` · **Internal ops:** `/admin`
- **Health probe:** `/api/health`

## Configuration

All optional — see **`SETUP.md`** for non-technical, click-by-click instructions.

| Variable | Unlocks |
|---|---|
| `ANTHROPIC_API_KEY` | Live AI generation (drafts, replies, campaign copy, report narration) |
| `DATABASE_URL` | Real Postgres persistence (`npm run db:push`, optional `npm run db:seed`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google sign-in + Business Profile connect |
| `GOOGLE_MAPS_API_KEY` | Real business lookup (onboarding + free score tool) |
| `AUTH_SECRET` / `ENCRYPTION_SECRET` | Session signing / Google-token encryption (set in production) |
| `NEXT_PUBLIC_APP_URL` | Permanent absolute origin for QR codes and OAuth redirects |
| `RESEND_API_KEY` (later) | Real email sending |

**Google Business Profile API** (reviews import, reply publishing, performance data) additionally requires Google's per-project approval — apply at <https://developers.google.com/my-business/content/prereqs>; the app shows an honest "approval pending" status until then.

## Testing

```bash
npm run typecheck     # strict TS
npx vitest run        # unit: industry catalog, AI engine, lints
npx playwright test   # e2e: 7 industry scenarios, mobile + desktop
```

See `TESTING.md` for the scenario matrix and latest results.

## Architecture

- **`lib/data`** — domain types, the multi-tenant `DataProvider` contract, in-memory + Drizzle/Postgres providers, the demo seed, the empty-workspace factory, derived-metric selectors.
- **`lib/auth`** — bcrypt password auth, JWT sessions (jose), role model.
- **`lib/industries`** — the 36-industry catalog (services, attributes, terminology, AI phrase banks, Google category mapping, custom industries).
- **`lib/ai`** — generation engine: Anthropic when keyed, deterministic industry/rating-aware templates otherwise; every output passes `lib/compliance` lints (no name-stuffing, no incentives, attribution honesty, no fabricated specifics, sentiment-rating consistency).
- **`lib/google`** — OAuth flows, Places client, approval-aware GBP clients, AES-GCM token encryption.
- **`app`** — route groups: marketing, auth, onboarding, owner app, staff PWA, customer review flow (`/r/[token]`), QR scan endpoint (`/q/[slug]`), agency portal, internal admin.

_Not legal advice: compliance controls are engineering safeguards; consult qualified counsel per jurisdiction before launch._
