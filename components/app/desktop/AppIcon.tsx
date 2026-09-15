import { cn } from "@/lib/utils/cn";
import { Icon, type IconName } from "@/components/icons";

/**
 * The tones an app-icon plate can take (globals.css `.ai-*`). Deliberately
 * few: the green family is the product, sky and graphite are neutral tools,
 * gold is reserved for earned celebration (milestones), and `brand` reads the
 * agency's white-label colour from CSS variables set by its shell.
 */
export type AppIconTone = "green" | "mint" | "sky" | "gold" | "ink" | "slate" | "plum" | "rose" | "brand";
export type AppIconSize = "sm" | "md" | "lg" | "dock";

// Literal class names on purpose: Tailwind keeps a `@layer components` rule
// only when its class appears verbatim in a source file, so a template
// string (`ai-${tone}`) would have every plate purged out of the build.
const TONE_CLASS: Record<AppIconTone, string> = {
  green: "ai-green",
  mint: "ai-mint",
  sky: "ai-sky",
  gold: "ai-gold",
  ink: "ai-ink",
  slate: "ai-slate",
  plum: "ai-plum",
  rose: "ai-rose",
  brand: "ai-brand",
};

const SIZE_CLASS: Record<AppIconSize, string> = {
  sm: "app-icon-sm",
  md: "app-icon-md",
  lg: "app-icon-lg",
  dock: "",
};
const GLYPH: Record<AppIconSize, number> = { sm: 15, md: 19, lg: 26, dock: 22 };

/**
 * A squircle app-icon plate with the Icon glyph in white — what the Dock and
 * the sidebar use so a section looks the same wherever it is launched from.
 */
export function AppIcon({
  icon,
  tone = "green",
  size = "dock",
  className,
  glyphSize,
}: {
  icon: IconName;
  tone?: AppIconTone;
  size?: AppIconSize;
  className?: string;
  glyphSize?: number;
}) {
  return (
    <span className={cn("app-icon", TONE_CLASS[tone], SIZE_CLASS[size], className)} aria-hidden="true">
      <Icon name={icon} size={glyphSize ?? GLYPH[size]} strokeWidth={size === "sm" ? 2 : 1.9} />
    </span>
  );
}
