# Foundly v3 implementation report

This file records the current implementation state after the commercial hardening and premium dashboard pass.

## Product and design

- Rebuilt the owner dashboard around the selected premium concept: dark executive hero, source-aware Growth Score, strong information hierarchy, compact KPI rhythm, and the “People found you / contacted you” trend treatment inspired by concept 3.
- Standardized the authenticated shells, page headers, cards, charts, empty states, mobile navigation, account controls, and location switching.
- Preserved accessibility signals in quantitative UI: text values accompany color, controls have accessible labels, responsive layouts keep touch targets, and customer review compliance paths remain visible at every rating.

## Commercial systems implemented

- Auth: bcrypt credentials, Google sign-in, signed JWT sessions, role scoping, password recovery with expiring one-time hashed tokens, referral attribution across email and Google registration.
- Security: bounded request parsing, authenticated AI endpoints, request rate limits, protected deep health, CSP and security headers, signed Stripe/Twilio webhooks, encrypted Google refresh tokens, workspace-scoped persistence.
- Google: Places matching/details, complete GBP review pagination, Business Profile Performance time series, rolling dashboard snapshots, durable OAuth refresh, immediate post-connect sync, and explicit 3×3/5×5 Places visibility scans.
- Delivery: Resend email, Twilio SMS, consent and suppression enforcement, E.164 validation, plan-credit limits, delivery callbacks, and STOP/HELP handling.
- Billing: Stripe Checkout, customer reuse, Billing Portal, signed webhook lifecycle reconciliation, Price-to-plan entitlement mapping, cancellation/payment state, and idempotent referral credits.
- Multi-location: isolated workspaces under one organization, plan limits, organization-verified switching, and location management UI.
- Agency: paid-owner access, isolated client creation, live rollups from client workspaces, white-label configuration, economics, and branded per-client/bulk reports.
- PWA: install manifest, app icon, staff service-worker registration, safe asset caching, and local offline capture queue. Authenticated HTML and API data are not cached.

## Data honesty

- Dashboard values carry per-field source and freshness. Unavailable Google data does not become an invented zero.
- Public Places review samples are labelled and kept separate from owned-profile review history.
- Rank Grid is labelled as relevance-ranked Google Places Text Search visibility, not as scraped Google Maps Local Pack rank.
- Demo actions are explicitly simulated and never write to production providers.
- Unconfigured external providers return actionable configuration states and do not record fake success.

## Verification

- `npm run typecheck`: green.
- `npx vitest run`: 91/91 green across 14 files.
- `npm run build`: green on Next.js 15.5.20.
- `npx playwright test`: 38/38 green across desktop and mobile.
- `git diff --check`: clean apart from platform line-ending notices.

See `TESTING.md` for browser coverage and the exact command matrix.

## External launch gates

The code paths are implemented, but a production launch still depends on external state:

- Google must approve the Cloud project for Business Profile APIs; the target accounts must grant the required OAuth scopes.
- Resend needs a verified sending domain.
- Twilio/carrier registration and production messaging policy approval must be complete.
- Stripe live products, Prices, customer portal configuration, and webhook endpoint must be created in the live account.
- Postgres backup/restore, provider quotas, billing alerts, error monitoring, privacy policy, terms, retention policy, and jurisdiction-specific legal review remain operator responsibilities.
- Physical-device PWA and deliverability testing must be repeated against the final production origin.

No source-control commit, push, or deployment is performed by this implementation pass unless explicitly requested.
