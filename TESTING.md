# Foundly testing

## Commands

```bash
npm run typecheck
npm test
npm run build
npx playwright test
```

Playwright starts the optimized app on port 3200 and uses the in-memory provider unless environment variables are explicitly supplied. The desktop project uses a 1440×900 viewport; the mobile project uses a 390×844 touch viewport for the customer flow.

## Current automated result

- TypeScript: green.
- Unit/integration: 132/132 tests across 23 files.
- Production build: green on Next.js 15.5.20.
- Browser suite: 38/38 scenarios across desktop and mobile.

## Unit coverage

- AI generation, rating-language consistency, business grounding, and fallback templates.
- 36-industry catalog integrity and fallback behavior.
- Source-aware dashboard metrics, freshness, rolling comparisons, and unavailable-vs-zero semantics.
- Password-reset token expiry, one-time consumption, and credential update behavior.
- Tenant/provider selection and collision-resistant QR slugs.
- Complete Google review pagination, public profile mapping, rolling performance snapshots, and rank-grid coordinate generation.
- Stripe webhook signatures, event reconciliation, Price mapping, cancellation, and referral-credit behavior.
- Twilio signature verification and phone normalization.
- Signed referral-code round trips and tamper rejection.
- Evidence-grounded Content Studio schema, prompt-injection boundary, private asset handling, and exact-payload recognition.
- Google post/reply/Q&A endpoint planning, signed public image URLs, publication idempotency, and approval preservation across monitored audits.
- Continuous-monitoring cron authentication, daily idempotency, batching, and new-suggestion notifications.

## Browser scenarios

- Demo entry, isolation, role routing, and sign-out.
- Real registration, guided onboarding skip, empty dashboard, sign-out, and credential login.
- Seven industry-specific staff-capture → request → QR → review journeys.
- Desktop and mobile 5-star drafting, 4-star language safeguards, and 1–3-star private feedback with the public Google path still visible.
- Invalid registration, weak password, missing consent, expired QR, and invalid review-token failures.
- Security regressions: legacy unsigned cookies, anonymous AI, anonymous deep-health, invalid public tokens, CSP, and response hardening.
- Commercial surfaces: premium dashboard trends, agency report delivery, and source-labelled rank-grid economics.

## Provider smoke tests required before launch

Automated keyless tests cannot prove external account configuration. Against the deployed production origin, verify:

1. Google OAuth account connect and refresh after access-token expiry.
2. Full review pagination and Performance API snapshots on an approved GBP project.
3. One real Resend email for each transactional template category.
4. Twilio accepted → delivered and accepted → failed callbacks, plus inbound STOP and HELP.
5. Stripe checkout, portal plan change, cancellation, webhook retry, and referral credit in test mode before live mode.
6. Agency client creation, metric rollup, and branded report delivery to a controlled mailbox.
7. PWA install and offline staff capture on physical Android and iOS devices.

Never run browser tests with live provider keys unless the test recipients, Stripe mode, and data-reset policy are intentionally controlled.
