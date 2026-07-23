import { notFound } from "next/navigation";
import { checkDatabase } from "@/lib/db/ensure";
import { hasAiKey } from "@/lib/ai/model";
import { appUrl } from "@/lib/utils/app-url";
import { Icon, type IconName } from "@/components/icons";
import { LinkButton } from "@/components/ds/Button";
import { InitDbButton, TestAiButton, TestPlacesButton } from "./SetupActions";
import { isSetupAdmin } from "./access";

export const metadata = { title: "Setup checklist", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Platform-admin setup checklist — shows only presence/health booleans, never
 * secret values. Previously public (V2), it disclosed the full deployment
 * configuration posture (which secrets/keys are set) to any anonymous visitor,
 * acting as a reconnaissance oracle for the other findings. It is now gated to
 * a real platform_admin session; anyone else gets a 404 (no existence signal).
 */
export default async function SetupPage() {
  if (!(await isSetupAdmin())) notFound();

  const db = await checkDatabase();
  const ai = hasAiKey();
  const openAi = Boolean(process.env.OPENAI_API_KEY);
  const googleOAuth = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const places = Boolean(process.env.GOOGLE_MAPS_API_KEY);
  const authSecret = Boolean(process.env.AUTH_SECRET);
  const encSecret = Boolean(process.env.ENCRYPTION_SECRET);
  const assetSigningSecret = Boolean(process.env.CONTENT_ASSET_SIGNING_SECRET || process.env.AUTH_SECRET);
  const cronSecret = Boolean(process.env.CRON_SECRET && process.env.CRON_SECRET.length >= 24);
  const appUrlSet = Boolean(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL);
  const resend = Boolean(process.env.RESEND_API_KEY);
  const stripe = Boolean(process.env.STRIPE_SECRET_KEY);
  const stripeWebhook = Boolean(process.env.STRIPE_WEBHOOK_SECRET);
  const stripePrice = Boolean(
    process.env.STRIPE_PRICE_STARTER_MONTHLY ||
      process.env.STRIPE_PRICE_GROWTH_MONTHLY ||
      process.env.STRIPE_PRICE_PRO_MONTHLY ||
      process.env.STRIPE_PRICE_MULTI_MONTHLY ||
      process.env.STRIPE_PRICE_AGENCY_MONTHLY,
  );
  const twilio = Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      (process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_FROM_NUMBER),
  );
  const base = await appUrl();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-[26px] font-extrabold text-ink lg:text-[30px]">Setup checklist</h1>
      <p className="mt-1 text-[15px] text-sub">
        Live status of this deployment. Add keys in Vercel → your project → Settings →
        Environment Variables, then <strong>redeploy</strong> — this page updates on refresh.
      </p>

      <div className="mt-6 space-y-3">
        <Item
          ok={ai}
          title="AI generation (ANTHROPIC_API_KEY)"
          okText="Key detected — reviews, replies and reports are AI-written."
          missingText="Not set — the app uses built-in smart templates. Add the key for genuinely AI-written drafts."
          action={ai ? <TestAiButton /> : undefined}
        />

        <Item
          ok={openAi}
          title="AI Content Studio (OPENAI_API_KEY)"
          okText="Key detected — exact Google post, reply, and Q&A previews can use OpenAI generation."
          missingText="Not set — the governed Content Studio cannot generate new post images or exact drafts."
        />

        <Item
          ok={db.configured && db.reachable && db.schemaReady}
          warn={db.configured && (!db.reachable || !db.schemaReady)}
          title="Database (DATABASE_URL)"
          okText="Connected and initialized — accounts and data are stored permanently."
          warnText={
            !db.reachable
              ? `Key is set but the database can't be reached${db.error ? ` (${db.error})` : ""}. Check the connection string in Vercel.`
              : "Connected, but the tables aren't created yet — click Initialize."
          }
          missingText="Not set — accounts work but reset periodically. Add a free Neon database (see SETUP.md §2)."
          action={db.configured && db.reachable && !db.schemaReady ? <InitDbButton /> : undefined}
        />

        <Item
          ok={places}
          title="Google business lookup (GOOGLE_MAPS_API_KEY)"
          okText="Key detected — onboarding finds real businesses; the score tool uses real ratings."
          missingText="Not set — business search shows an honest fallback. Add a Places API key (SETUP.md §3B)."
          action={places ? <TestPlacesButton /> : undefined}
        />

        <Item
          ok={googleOAuth}
          title="Google sign-in (GOOGLE_CLIENT_ID + SECRET)"
          okText="Keys detected — 'Continue with Google' is live."
          missingText="Not set — email/password sign-in still works. Add the OAuth client (SETUP.md §3C)."
          detail={
            googleOAuth
              ? `Make sure these redirect URIs are registered on the OAuth client: ${base}/api/auth/google/callback and ${base}/api/google/connect/callback`
              : undefined
          }
        />

        <Item
          ok={authSecret}
          title="Session security (AUTH_SECRET)"
          okText="Set — login sessions are signed with your secret."
          missingText="Not set — a development fallback is in use. Add the value Claude generated for you."
        />
        <Item
          ok={encSecret}
          title="Token encryption (ENCRYPTION_SECRET)"
          okText="Set — stored Google tokens are encrypted with your key."
          missingText="Not set — falls back to AUTH_SECRET. Add the value Claude generated for you."
        />
        <Item
          ok={assetSigningSecret}
          title="Approved image delivery signing"
          okText="Set — Google can fetch an approved post image through a short-lived signed URL."
          missingText="Not set — production local-post publishing fails closed. Set CONTENT_ASSET_SIGNING_SECRET."
        />
        <Item
          ok={cronSecret && db.configured}
          warn={cronSecret !== db.configured}
          title="Continuous monitoring (CRON_SECRET + database)"
          okText="Ready — scheduled read-only profile audits can persist and safely resume in batches."
          warnText="Partially configured. Continuous monitoring requires both CRON_SECRET and DATABASE_URL."
          missingText="Not set — automatic evidence refresh remains disabled; owner-triggered sync still works."
        />
        <Item
          ok={appUrlSet}
          title="Site address (NEXT_PUBLIC_APP_URL)"
          okText={`Set — QR codes permanently point at ${base}.`}
          missingText={`Not set — QR codes use the current domain (${base}). Set it so printed codes never break.`}
        />
        <Item
          ok={resend}
          title="Email sending (Resend)"
          okText="Key detected — review requests, invites, password resets, and agency reports can send."
          missingText="Not set — email delivery remains disabled and actions report the missing configuration."
        />
        <Item
          ok={stripe && stripeWebhook && stripePrice}
          warn={stripe && (!stripeWebhook || !stripePrice)}
          title="Billing lifecycle (Stripe)"
          okText="Secret, webhook, and a paid price are detected — checkout, portal, and entitlement reconciliation are active."
          warnText="Stripe is partially configured. Add STRIPE_WEBHOOK_SECRET and paid price IDs before selling plans."
          missingText="Not set — plan upgrades show an honest connect-billing state."
        />
        <Item
          ok={twilio}
          title="SMS delivery (Twilio)"
          okText="Credentials and a sender are detected — consent-led SMS, delivery callbacks, and STOP/HELP handling are active."
          missingText="Not set — SMS delivery remains disabled. Email requests continue to work when Resend is connected."
        />
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <LinkButton href="/sign-in" variant="primary">Go to sign in</LinkButton>
        <LinkButton href="/" variant="secondary">Home</LinkButton>
      </div>

      <p className="mt-6 text-[13px] text-faint">
        This page shows configuration status only — never secret values. After adding or
        changing a key in Vercel, redeploy (Deployments → ⋯ → Redeploy) and refresh.
      </p>
    </div>
  );
}

function Item({
  ok, warn, title, okText, warnText, missingText, action, detail,
}: {
  ok: boolean;
  warn?: boolean;
  title: string;
  okText: string;
  warnText?: string;
  missingText: string;
  action?: React.ReactNode;
  detail?: string;
}) {
  const state: "ok" | "warn" | "missing" = ok ? "ok" : warn ? "warn" : "missing";
  const icon: IconName = state === "ok" ? "check-circle" : state === "warn" ? "alert" : "x";
  const color =
    state === "ok" ? "text-primary" : state === "warn" ? "text-gold-deep" : "text-faint";
  const text = state === "ok" ? okText : state === "warn" ? (warnText ?? missingText) : missingText;

  return (
    <div className="rounded-card border border-hairline bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Icon name={icon} size={20} className={`mt-0.5 shrink-0 ${color}`} />
          <div>
            <div className="text-[15px] font-bold text-ink">{title}</div>
            <p className="mt-0.5 text-[14px] text-sub">{text}</p>
            {detail ? <p className="mt-1 text-[13px] text-faint break-all">{detail}</p> : null}
          </div>
        </div>
        {action}
      </div>
    </div>
  );
}
