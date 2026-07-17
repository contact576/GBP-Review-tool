import { forwardRef } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { Icon, type IconName } from "@/components/icons";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "gold";
type Size = "sm" | "md" | "lg";

// Single tokenised transition + one green focus ring for the whole ladder.
// (The global :focus-visible outline is intentionally replaced here with a
// ring so filled buttons get a crisp, on-brand halo rather than a stray outline.)
const base =
  "inline-flex items-center justify-center gap-2 font-semibold rounded-btn transition-all duration-150 whitespace-nowrap select-none " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-paper " +
  "disabled:opacity-50 disabled:pointer-events-none disabled:shadow-none";

// Clean 3-tier ladder: filled-green primary / hairline secondary / text ghost.
// Variants change fill + border only — never shape (radius stays 12 / rounded-btn).
const variants: Record<Variant, string> = {
  // Filled green with a subtle Lovable-style inset top highlight for depth.
  primary:
    "bg-primary text-white hover:bg-primary-dark active:bg-primary-dark " +
    "shadow-[0_1px_2px_rgba(23,32,29,0.12),inset_0_1px_0_rgba(255,255,255,0.16)]",
  // Hairline secondary — reads as a quiet card, greens on hover.
  secondary:
    "bg-card text-ink border border-hairline hover:bg-primary-wash hover:border-primary/30 active:bg-primary-wash",
  // Text ghost — no fill at rest.
  ghost: "bg-transparent text-sub hover:bg-primary-wash hover:text-ink active:bg-primary-tint/60",
  danger:
    "bg-danger text-white hover:brightness-95 active:brightness-90 shadow-sm focus-visible:ring-danger",
  gold: "bg-gold text-ink hover:bg-gold-deep hover:text-white active:brightness-95 shadow-sm",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-[13px] min-h-[36px]",
  md: "h-11 px-4 text-[14px] min-h-[44px]",
  lg: "h-12 px-6 text-[15px] min-h-[48px]",
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  fullWidth?: boolean;
  className?: string;
  children?: React.ReactNode;
}

type ButtonProps = CommonProps &
  React.ButtonHTMLAttributes<HTMLButtonElement>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", icon, iconRight, loading, fullWidth, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(base, variants[variant], sizes[size], fullWidth && "w-full", className)}
      {...props}
    >
      {loading ? (
        <span className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : icon ? (
        <Icon name={icon} size={size === "sm" ? 16 : 18} />
      ) : null}
      {children}
      {iconRight && !loading ? <Icon name={iconRight} size={size === "sm" ? 16 : 18} /> : null}
    </button>
  );
});

interface LinkButtonProps extends CommonProps {
  href: string;
  target?: string;
  prefetch?: boolean;
}

export function LinkButton({
  href, variant = "primary", size = "md", icon, iconRight, fullWidth, className, children, target, prefetch,
}: LinkButtonProps) {
  return (
    <Link
      href={href}
      target={target}
      prefetch={prefetch}
      className={cn(base, variants[variant], sizes[size], fullWidth && "w-full", className)}
    >
      {icon ? <Icon name={icon} size={size === "sm" ? 16 : 18} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} size={size === "sm" ? 16 : 18} /> : null}
    </Link>
  );
}
