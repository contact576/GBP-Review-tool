import { Icon } from "@/components/icons";
import { LinkButton } from "@/components/ds/Button";
import { upgradeFor, type Feature } from "@/lib/billing/plans";

/**
 * Reusable Pro-gate. Renders `children` as a de-emphasized, inert preview
 * behind a gold-accented upgrade CTA that deep-links to billing. Server-safe
 * (no client hooks) so it can wrap the body of server-component pages directly.
 *
 * The upsell target is derived from the feature via `upgradeFor`, keeping the
 * plan catalog (lib/billing/plans) the single source of truth for gating.
 */
export function Paywall({
  feature,
  title,
  children,
}: {
  feature: string;
  title: string;
  children: React.ReactNode;
}) {
  const plan = upgradeFor(feature as Feature);

  return (
    <div className="relative overflow-hidden rounded-card">
      {/* Preview — visually de-emphasized and non-interactive. */}
      <div
        className="pointer-events-none max-h-[560px] select-none overflow-hidden opacity-60"
        aria-hidden
      >
        {children}
      </div>

      {/* Scrim + upgrade card overlay. */}
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-paper/40 via-paper/70 to-paper/95 p-4">
        <div className="w-full max-w-sm rounded-card border border-gold/40 bg-card p-6 text-center shadow-lg">
          <div className="mx-auto grid size-12 place-items-center rounded-btn bg-gold-tint text-gold-deep">
            <Icon name="lock" size={22} title="Locked" />
          </div>
          <h3 className="mt-4 text-[18px] font-bold text-ink">{title}</h3>
          <p className="mt-1.5 text-[14px] text-sub">
            Included with {plan.name}. Upgrade to unlock the full view.
          </p>
          <div className="mt-5 flex justify-center">
            <LinkButton href="/app/settings/billing" variant="gold" icon="sparkles">
              Upgrade to {plan.name}
            </LinkButton>
          </div>
        </div>
      </div>
    </div>
  );
}
