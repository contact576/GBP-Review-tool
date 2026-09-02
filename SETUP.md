# Foundly production setup

Foundly can be explored without provider keys, but do not sell or operate the production service until persistence, secrets, webhooks, and the providers you expose are configured and verified.

Never paste secrets into source files, screenshots, issues, or chat. Store local values in `.env.local` and deployment values in the hosting provider’s encrypted environment-variable settings.

## 1. Application, database, and secrets

Set:

```text
NEXT_PUBLIC_APP_URL=https://your-domain.example
DATABASE_URL=postgres://...
AUTH_SECRET=<independent random value of at least 32 bytes>
ENCRYPTION_SECRET=<independent random value of at least 32 bytes>
HEALTH_CHECK_SECRET=<independent random value of at least 32 bytes>
CONTENT_ASSET_SIGNING_SECRET=<independent random value of at least 32 bytes>
CRON_SECRET=<independent random value of at least 32 bytes>
```

- `NEXT_PUBLIC_APP_URL` must be the permanent HTTPS origin with no trailing slash. OAuth callbacks, SMS callbacks, emails, and printed QR codes rely on it.
- `DATABASE_URL` may point to Neon, Supabase, or standard Postgres. New deployments self-initialize idempotently; `npm run db:push` is also available for controlled migrations.
- `AUTH_SECRET` signs sessions and referral codes.
- `ENCRYPTION_SECRET` encrypts Google refresh tokens with AES-256-GCM.
- `HEALTH_CHECK_SECRET` protects `GET /api/health?deep=1` through the `x-foundly-health-secret` header.
- `CONTENT_ASSET_SIGNING_SECRET` signs short-lived, image-only URLs that Google fetches after a local post is approved.
- `CRON_SECRET` protects the read-only continuous-monitoring route. Vercel sends it automatically to configured cron requests.

Production auth and Google credential encryption fail closed when required secrets are missing.

## 2. Google Cloud

Create one Google Cloud project, enable billing, and enable Places API (New). Create a restricted server API key:

```text
GOOGLE_MAPS_API_KEY=...
```

This powers onboarding business search, public profile data, the score tool, and explicit rank-grid scans. Restrict the key to the required API and production server environment. Rank grids make 9 or 25 Places Text Search calls per scan, so configure quota and billing alerts.

Create an OAuth 2.0 Web application and set:

```text
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

Register both production callback URLs exactly:

```text
https://your-domain.example/api/auth/google/callback
https://your-domain.example/api/google/connect/callback
```

Add the equivalent `http://localhost:3000` URLs only to a development OAuth client.

For owned-profile reviews and performance data, request Google Business Profile API access and enable the Account Management and Business Profile Performance APIs. Until Google approves the project, public Places data continues to work and the UI identifies the owned-profile connection as pending.

## 3. Email with Resend

Verify a sending domain in Resend, create an API key, and set:

```text
RESEND_API_KEY=re_...
EMAIL_FROM=Foundly <reviews@your-domain.example>
```

Email activates review requests, staff invitations, password resets, and branded agency reports. Use a verified production sender; Resend’s onboarding sender is only suitable for sandbox testing.

## 4. SMS with Twilio

Complete the carrier registration required for the countries where you send. For US application-to-person traffic, configure the relevant A2P registration and consent language.

Set:

```text
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_MESSAGING_SERVICE_SID=MG...
```

`TWILIO_FROM_NUMBER=+14155550123` may be used instead of a Messaging Service SID, but a Messaging Service is recommended.

Configure the Messaging Service’s incoming-message webhook as:

```text
POST https://your-domain.example/api/webhooks/twilio/inbound
```

Foundly supplies its signed status-callback URL on every outbound message. The implementation verifies Twilio signatures, persists sent/delivered/failed state, enforces service consent and plan credits, and globally suppresses numbers that send STOP-family keywords. HELP/INFO return service information.

## 5. Stripe billing

Create recurring monthly and annual Prices for each plan you intend to sell, then set:

```text
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER_MONTHLY=price_...
STRIPE_PRICE_STARTER_ANNUAL=price_...
STRIPE_PRICE_GROWTH_MONTHLY=price_...
STRIPE_PRICE_GROWTH_ANNUAL=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_ANNUAL=price_...
STRIPE_PRICE_MULTI_MONTHLY=price_...
STRIPE_PRICE_MULTI_ANNUAL=price_...
STRIPE_PRICE_AGENCY_MONTHLY=price_...
STRIPE_PRICE_AGENCY_ANNUAL=price_...
```

Create this webhook endpoint:

```text
POST https://your-domain.example/api/webhooks/stripe
```

Subscribe it to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `customer.subscription.paused`
- `customer.subscription.resumed`

The webhook verifies Stripe’s raw-payload signature, reconciles customer/subscription/price/period/cancellation state, maps immutable Price IDs to entitlements, and returns 5xx on persistence or referral-credit failure so Stripe retries. Checkout reuses a stored customer, and plan/card changes use the Stripe Billing Portal.

Referral rewards default to 5,000 minor units ($50.00):

```text
REFERRAL_CREDIT_CENTS=5000
```

Credits are idempotent Stripe customer-balance transactions and apply only after a referred workspace becomes an active paid subscriber.

## 6. AI generation

Set `ANTHROPIC_API_KEY` to use live generation for drafts, replies, campaigns, and narration. `FOUNDLY_AI_MODEL` overrides the configured model. Without a key, Foundly uses deterministic industry- and rating-aware templates that still pass the same compliance lints.

Set the OpenAI project key used by the governed Content Studio:

```text
OPENAI_API_KEY=sk-proj-...
FOUNDLY_OPENAI_TEXT_MODEL=gpt-5.4-mini
FOUNDLY_OPENAI_IMAGE_MODEL=gpt-image-2
```

OpenAI API billing is separate from ChatGPT subscriptions. The selected API project must have available billing or credits. Generated text and images remain private until the owner reviews the exact proposal; approval creates an idempotent Google publishing job and read-after-write verification.

### AI Visibility engines

AI Visibility puts the same buying questions to every answer engine that has a key, and shows the answers side by side:

```text
OPENAI_API_KEY=sk-proj-...        # ChatGPT (model knowledge, via the API)
ANTHROPIC_API_KEY=sk-ant-...      # Claude (model knowledge)
GOOGLE_AI_API_KEY=AIza...         # Gemini API (model knowledge — not AI Overviews)
PERPLEXITY_API_KEY=pplx-...       # Perplexity (searches the live web)
```

Optional per-engine model overrides: `FOUNDLY_AEO_OPENAI_MODEL`, `FOUNDLY_AEO_ANTHROPIC_MODEL`, `FOUNDLY_AEO_GEMINI_MODEL`, `FOUNDLY_AEO_PERPLEXITY_MODEL`. An engine with no key appears in the report as "not connected" and is never counted as a miss. One question on one engine is one paid API call; runs are metered per month by plan.

## 7. Continuous monitoring

`vercel.json` calls `GET /api/cron/monitor` hourly. Each connected workspace is processed at most once per UTC day, failed windows can retry, and large tenant sets drain in bounded batches. Configure `DATABASE_URL`, `CRON_SECRET`, and optionally `MONITORING_BATCH_SIZE` (default 15). Any other scheduler must send `Authorization: Bearer $CRON_SECRET`.

## 8. Deployment verification

After adding or changing environment variables, redeploy and open `/setup`. It shows configuration booleans and health only, never secret values.

Run before release:

```bash
npm run typecheck
npm test
npm run build
npx playwright test
```

Then verify on the deployed origin:

1. Register and recover a password.
2. Complete Google sign-in and Business Profile connect callbacks.
3. Send one real email and one real SMS to consented test recipients; confirm delivery callbacks and STOP suppression.
4. Complete a Stripe test checkout, open the portal, change plans, and cancel; confirm entitlements follow the webhook state.
5. Run the protected deep health probe from the monitoring service.
6. Confirm every webhook uses HTTPS and the exact deployed origin used to calculate provider signatures.
7. Trigger one authenticated monitoring run and confirm a second call in the same UTC window does not duplicate the audit.
8. Approve a controlled Google post, reply, and Q&A answer; verify the provider resource is read back before Foundly shows it as published.

The PWA service worker intentionally avoids caching authenticated HTML or API responses. Test installation and offline staff capture on physical iOS and Android devices before field rollout.
