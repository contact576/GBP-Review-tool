import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/ds/misc";
import { LinkButton } from "@/components/ds/Button";

export interface Tier {
  name: string;
  price: number;
  cadence: string;
  tagline: string;
  features: string[];
  cta: string;
  href: string;
  anchor?: boolean;
  current?: boolean;
}

export function PricingTierCard({
  tier, currencySymbol, annual,
}: {
  tier: Tier; currencySymbol: string; annual?: boolean;
}) {
  const price = annual ? Math.round(tier.price * 10) : tier.price;
  const per = tier.price === 0 ? "" : annual ? "/yr" : "/mo";
  return (
    <div
      className={cn(
        "relative flex flex-col rounded-card border bg-card p-5 shadow-sm",
        tier.anchor ? "border-primary ring-2 ring-primary/20" : "border-hairline",
      )}
    >
      {tier.anchor ? (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge tone="gold" icon="star">Most popular</Badge>
        </div>
      ) : null}
      <div className="mb-1 text-[15px] font-bold text-ink">{tier.name}</div>
      <div className="mb-2 flex items-end gap-1">
        <span className="text-[30px] font-extrabold tabular-nums text-ink">
          {tier.price === 0 ? "Free" : `${currencySymbol}${price}`}
        </span>
        {per ? <span className="mb-1 text-[13px] text-faint">{per}</span> : null}
      </div>
      <p className="mb-4 text-[13px] text-sub">{tier.tagline}</p>
      <ul className="mb-5 flex-1 space-y-2">
        {tier.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-[13px] text-ink/90">
            <Icon name="check" size={16} className="mt-0.5 shrink-0 text-primary" />
            {f}
          </li>
        ))}
      </ul>
      <LinkButton
        href={tier.href}
        variant={tier.anchor ? "primary" : "secondary"}
        fullWidth
      >
        {tier.current ? "Current plan" : tier.cta}
      </LinkButton>
    </div>
  );
}
