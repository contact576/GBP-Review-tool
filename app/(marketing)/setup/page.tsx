import { checkDatabase } from "@/lib/db/ensure";
import { hasAiKey } from "@/lib/ai/model";
import { appUrl } from "@/lib/utils/app-url";
import { Icon, type IconName } from "@/components/icons";
import { LinkButton } from "@/components/ds/Button";
import { InitDbButton, TestAiButton, TestPlacesButton } from "./SetupActions";

export const metadata = { title: "Setup checklist" };
export const dynamic = "force-dynamic";

/**
 * Self-service setup checklist — shows only presence/health booleans, never
 * secret values. Lets a non-technical owner verify their Vercel environment
 * variables and initialize the database with one click.
 */
export default async function SetupPage() {
  const db = await checkDatabase();
  const ai = hasAiKey();
  const googleOAuth = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const places = Boolean(process.env.GOOGLE_MAPS_API_KEY);
  const authSecret = Boolean(process.env.AUTH_SECRET);
  const encSecret = Boolean(process.env.ENCRYPTION_SECRET);
  const appUrlSet = Boolean(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL);
  const resend = Boolean(process.env.RESEND_API_KEY);
  const stripe = Boolean(process.env.STRIPE_SECRET_KEY);
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
          ok={appUrlSet}
          title="Site address (NEXT_PUBLIC_APP_URL)"
          okText={`Set — QR codes permanently point at ${base}.`}
          missingText={`Not set — QR codes use the current domain (${base}). Set it so printed codes never break.`}
        />
        <Item
          ok={resend}
          title="Email sending (RESEND_API_KEY) — optional, later"
          okText="Key detected — email delivery is configured."
          missingText="Not set — review-request emails, invites and password resets are queued behind this. Fine to add later."
        />
        <Item
          ok={stripe}
          title="Billing (STRIPE_SECRET_KEY) — optional, later"
          okText="Key detected — plans, checkout and the billing portal are live."
          missingText="Not set — the app runs on the free/trial tier; plan upgrades show an honest 'connect billing' state. Fine to add later."
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
