# Foundly — Setup Guide (non-technical, click-by-click)

Foundly works out of the box in demo mode. Each key below unlocks a real capability.
You'll paste each value in **two places**: (1) to Claude in chat (so it can be tested during the build), and (2) into **Vercel** so your live site uses it.

> **How to add a key to Vercel (same steps every time):**
> 1. Go to **vercel.com** → log in → click your **project** (the GBP-Review-tool one)
> 2. Click **Settings** (top tab) → **Environment Variables** (left menu)
> 3. In "Key" type the NAME exactly as shown below; in "Value" paste the secret → **Save**
> 4. After adding keys, go to **Deployments** (top tab) → click the "⋯" on the newest deployment → **Redeploy** so the site picks them up.

---

## 1. Anthropic API key — unlocks real AI review writing  (~5 min)

What it fixes: review drafts, reply suggestions, and report text become genuinely AI-written and grounded in the rating/service/industry (instead of templates).

1. Go to **https://console.anthropic.com** → sign up / log in
2. Left menu → **API keys** → **Create key** → name it `foundly` → **Copy** the key (starts with `sk-ant-`)
3. You may need to add a payment method under **Billing** ($5 credit is plenty to start — drafts cost fractions of a cent with the model Foundly uses)
4. Add to Vercel as: **`ANTHROPIC_API_KEY`**

## 2. Neon database — unlocks real saved data  (~5 min, free)

What it fixes: real accounts and everything you do (customers, requests, reviews, settings) is saved permanently instead of resetting.

1. Go to **https://neon.tech** → **Sign up** (Google login is easiest) → it creates a free project automatically
2. On the project dashboard, find **Connection string** → select **Pooled connection** → **Copy** (starts with `postgres://`)
3. Add to Vercel as: **`DATABASE_URL`**
4. Tell Claude when done — it will run the one-time database setup (`db:push`) for you.

## 3. Google Cloud — unlocks Google sign-in + real business lookup  (~15 min, free)

What it fixes: "Sign in with Google" works; onboarding finds your REAL business on Google (so your QR/review links point at your actual Google review page); the free score tool uses your real rating and review count.

**A. Create the project**
1. Go to **https://console.cloud.google.com** → sign in → top bar → **Select a project** → **New project** → name `foundly` → **Create** (then make sure it's selected)

**B. Enable the Places API**
2. Top search bar → type **"Places API (New)"** → open it → **Enable**
3. Left menu → **APIs & Services → Credentials** → **+ Create credentials → API key** → **Copy** it
4. Add to Vercel as: **`GOOGLE_MAPS_API_KEY`**

**C. Google sign-in (OAuth)**
5. **APIs & Services → OAuth consent screen** → User type **External** → fill only the required fields (app name `Foundly`, your email) → Save through the steps
6. **Credentials** → **+ Create credentials → OAuth client ID** → Application type **Web application** → name `foundly-web`
7. Under **Authorized redirect URIs**, click **+ Add URI** four times and paste (replace `YOUR-SITE` with your real Vercel URL):
   - `https://YOUR-SITE.vercel.app/api/auth/google/callback`
   - `https://YOUR-SITE.vercel.app/api/google/connect/callback`
   - `http://localhost:3000/api/auth/google/callback`
   - `http://localhost:3000/api/google/connect/callback`
8. **Create** → copy both the **Client ID** and **Client secret**
9. Add to Vercel as: **`GOOGLE_CLIENT_ID`** and **`GOOGLE_CLIENT_SECRET`**

**D. Google Business Profile API (the deep integration — reviews import, posting replies)**
This one needs Google's per-project approval (typically 1–2 weeks). Foundly is built ready for it and shows an honest "approval pending" status until then.
10. Read: **https://developers.google.com/my-business/content/prereqs** → submit the access request form: **https://support.google.com/business/contact/api_default** (describe: "Review management software for local businesses; requesting API access for reading and replying to reviews on behalf of authenticated business owners.")
11. Once approved, in the Cloud console search for and **Enable**: "My Business Account Management API", "My Business Business Information API", "Business Profile Performance API" — then tell Claude.

## 4. Security secrets — Claude generates these for you

Add these two to Vercel (Claude will give you the values in chat):
- **`AUTH_SECRET`** — signs login sessions
- **`ENCRYPTION_SECRET`** — encrypts stored Google tokens

## 5. Your site address

Add to Vercel as: **`NEXT_PUBLIC_APP_URL`** = your live URL, e.g. `https://YOUR-SITE.vercel.app` (no trailing slash). Makes printed QR codes permanent even if the deploy URL changes.

---

## Later (not needed now)

| Service | Unlocks | Where |
|---|---|---|
| **Resend** (`RESEND_API_KEY`) | Real email sending (review requests, password resets) | resend.com — free tier |
| **Stripe** | Real subscription billing | stripe.com |
| **Twilio** | SMS review requests (needs A2P carrier approval, 1–5 days) | twilio.com |

## Checklist

- [ ] `ANTHROPIC_API_KEY` in Vercel + pasted to Claude
- [ ] `DATABASE_URL` in Vercel + pasted to Claude
- [ ] `GOOGLE_MAPS_API_KEY` in Vercel + pasted to Claude
- [ ] `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` in Vercel + pasted to Claude
- [ ] `AUTH_SECRET` + `ENCRYPTION_SECRET` in Vercel (values from Claude)
- [ ] `NEXT_PUBLIC_APP_URL` in Vercel
- [ ] Redeployed after adding keys
- [ ] GBP API access request submitted (approval takes days–weeks)
