# Foundly — v3 Execution Report (Full-Blueprint Completion & Design Overhaul)

Honest status of the v3 pass. Everything below is either verified green, or
clearly marked as ready-but-inactive / gated. Nothing is faked.

## What was rebuilt / added

**Wave 1 — Desktop-first design overhaul**
- One standardized `PageHeader` (H1 26/30) across owner, agency, and admin — killed the drifting/inconsistent titles.
- Content width 1560→1400 (readable, not sprawling); prominent business label in the top bar.
- Guided `EmptyState` (icon + sentence + action) replacing bare-`<p>` empties across owner/admin/agency; admin table text bumped to 14px.
- (Shell was already responsive: desktop rail + mobile bottom-tab + More sheet.)

**Wave 2 — Premium re-skin of the two public surfaces**
- Customer review flow: one decision per screen, labelled stars, attribute-chip grid, selectable AI draft cards (tone/regenerate/edit), "Copy & open Google" mega-CTA with Copied confirmation + restrained gold celebration; **1–3★ keeps the public Google link visible (compliance invariant preserved)**; powered-by badge; honest loading/offline/expired/already-used states; **no emoji**.
- Staff PWA: ≤10s one-handed capture, dual consent (CASL), giant Send, optimistic tally + rank, kiosk QR, offline queue + validation.

**Wave 3 — Every control real or honestly gated**
- Integrations "Reconnect/Manage" → real per-provider routes (killed the setTimeout fake).
- Admin feature flags → persist (setFeatureFlagAction, optimistic + rollback).
- Customers CSV **import** → real parse + preview + de-dupe + importCustomersAction.
- Email wired best-effort (Resend) into review-request + staff-invite; honest "queued" when unconfigured.

**Wave 4 — Commercial layer (ready-but-inactive)**
- Real Billing screen: plan status + trial day-N + living-free explainer, AI/SMS usage meters, full plan matrix (Growth anchor, monthly/annual), upgrades → Stripe Checkout (honest "connect billing" when off), pause + **celebratory downgrade**.
- Stripe adapter (checkout/portal/webhook-verify) + webhook route; Resend adapter + templates; `lib/billing/plans` entitlements engine; `/setup` + SETUP.md activation guides.

**Wave 5 — Growth / moat features**
- Milestone share cards (canvas PNG, watermarked).
- Pro paywall gating (visibility, rank-grid) via entitlements.
- Referral card (give/get shareable link).
- Embeddable website widget (`/w/[slug]`) + real iframe embed snippet in Studio.
- Review durability watchdog (vanished/at-risk banner + tab).
- Reminder automations section (real on/off toggles).
- Free-score: compare-any-business head-to-head + downloadable score card.

**Wave 6 — Accessibility (WCAG AA)**
- Additive pass on DS + chart components (dialog focus-trap, aria-live toasts, labelled inputs, value-as-text on dials/sparklines/bars). *(final agent — see commit log)*

## Verified
- `npm run typecheck` = 0 errors; `npm run build` green; **66/66 vitest**; **21/21 Playwright** (desktop 1440 + mobile 390) at each integration point.
- Live deployment verified via `/api/health?deep=1` (AI, Places incl. Place Details, DB schema all green).

## Ready-but-inactive (you activate with keys — nothing faked)
- **Stripe** billing, **Resend** email, **Twilio/A2P** SMS — fully coded; honest "connect X" states until keys added (guides in SETUP.md).

## Gated by external approval
- **Google Business Profile API** (full review history import + Co-Pilot publishing + performance snapshot): built + unit-tested, live-untested until Google approves your project (pending, 1–2 weeks).

## Honestly still partial / not built (would need more scope or paid data)
- Multi-location rollup (schema is single-location today).
- Rank-Grid / AI-Visibility **real** data providers (SERP/LLM scans) — shipped as honest Pro previews, not live scans.
- Agency white-label report **send** engine (email-gated) and deeper admin console modules.
- Native mobile apps (the web app is responsive; not a packaged PWA/native build).
