# Foundly

Foundly is a commercial local-growth platform for helping local businesses collect genuine reviews, improve their Google Business Profile, understand how customers find and contact them, and manage growth across locations or agency clients.

The core loop is:

> ASK → REVIEWS → OPTIMIZED PROFILE → VISIBILITY → NEW CUSTOMERS → REPEAT

Built with Next.js 15, React 19, TypeScript, Tailwind, Drizzle, and Postgres. A labelled in-memory demo works without provider keys; production capabilities activate only when their configuration is present.

## Implemented product

- Premium, source-aware owner dashboard with Growth Score, Google discovery and contact trends, weekly priorities, review activity, and honest unavailable/freshness states.
- Email/password and Google registration, signed JWT sessions, role-gated consoles, password recovery with one-time hashed tokens, signed referral attribution, and multi-tenant workspace isolation.
- Google Places business matching, public profile sync, complete GBP review pagination, rolling Business Profile Performance metrics, durable encrypted refresh tokens, and explicit Google Places visibility-grid scans.
- Review-request delivery by Resend email or Twilio SMS, service-consent enforcement, SMS quotas, signed delivery callbacks, and global STOP/HELP suppression.
- Customer review journey with a public Google path at every rating, private feedback, industry/rating-aware drafts, and compliance lints.
- Stripe Checkout, customer portal, signed webhook reconciliation, price-to-entitlement mapping, cancellation/payment state, and idempotent referral credits.
- Installable staff PWA with an offline capture queue and safe service-worker caching.
- Multi-location workspaces with organization-scoped switching and plan limits.
- Agency console with isolated client workspaces, live client rollups, white-label settings, economics, and branded individual/bulk email reports.
- Pro rank grid, campaigns, analytics, QR/print studio, website widget, milestones, referral program, and internal platform console.
- Full Google profile capability audit, multi-source evidence conflicts, governed suggestion inbox, and exact-preview profile mutations with idempotent read-after-write verification.
- OpenAI Content Studio for evidence-grounded posts, owner replies, Q&A answers, and original post images; nothing publishes before explicit approval.
- Signed Google post-image delivery, durable publication jobs, and continuous monitoring that preserves in-flight approvals and alerts owners to new evidence-backed suggestions.

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

- Demo: `/sign-in` → Explore the demo
- New account: `/sign-up`
- Self-service environment check: `/setup`
- Customer QR example: `/q/harbourview` in demo mode
- Health probe: `/api/health`

## Production configuration

Copy `.env.example` to `.env.local` for local development. See `SETUP.md` for provider setup and webhook URLs.

| Capability | Variables |
|---|---|
| Persistence | `DATABASE_URL` |
| Security | `AUTH_SECRET`, `ENCRYPTION_SECRET`, `HEALTH_CHECK_SECRET`, `CONTENT_ASSET_SIGNING_SECRET`, `CRON_SECRET` |
| Public origin | `NEXT_PUBLIC_APP_URL` |
| AI | `ANTHROPIC_API_KEY`; `OPENAI_API_KEY` plus optional content/image model overrides |
| AI Visibility engines | `OPENAI_API_KEY` (ChatGPT), `ANTHROPIC_API_KEY` (Claude), `GOOGLE_AI_API_KEY` (Gemini), `PERPLEXITY_API_KEY` (Perplexity, web-grounded); optional `FOUNDLY_AEO_*_MODEL` overrides. An engine without a key is reported as not connected, never as not naming you |
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_MAPS_API_KEY` |
| Email | `RESEND_API_KEY`, `EMAIL_FROM` |
| SMS | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, plus a Messaging Service SID or From number |
| Billing | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and per-plan Stripe Price IDs |

Google Business Profile API access is project-approved by Google; the public Places-based capabilities work independently when `GOOGLE_MAPS_API_KEY` is configured.

## Verification

```bash
npm run typecheck
npm test
npm run build
npx playwright test
```

Current local verification: lint and strict typecheck green, production build green, and 132/132 unit/integration tests green. Browser regression instructions and the scenario matrix are in `TESTING.md`.

## Architecture

- `app/` — marketing, authentication, onboarding, owner, staff, customer, agency, and platform route groups.
- `lib/data/` — domain model and matching in-memory/Postgres providers with workspace-scoped mutations.
- `lib/google/` — OAuth, Places, GBP review/performance sync, token encryption, and visibility grids.
- `lib/monitoring/` — cron authentication, idempotent monitoring windows, batched sync, and new-opportunity notifications.
- `lib/billing/` — plan entitlements, Stripe REST adapter, and webhook reconciliation.
- `lib/sms/` and `lib/email/` — provider adapters, consent-aware delivery, and templates.
- `lib/security/` — API guards, bounded payload parsing, and rate limiting.
- `lib/industries/`, `lib/ai/`, and `lib/compliance/` — industry intelligence, generation, and output safeguards.

Compliance controls are engineering safeguards, not legal advice. Review launch behavior with qualified counsel in every jurisdiction where messaging or review solicitation will operate.
