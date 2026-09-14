/**
 * The desktop wallpaper: a fixed, slowly drifting mesh of brand-tinted light
 * with a fine grain veil on top. Every authed shell (owner, agency, admin)
 * and the auth/onboarding canvases sit on this, so the glass chrome always
 * has something to refract. Purely decorative — aria-hidden, no pointer
 * events, and the drift freezes under prefers-reduced-motion (globals.css).
 *
 * An agency can tint it with its own brand: pass `tint` and the two warm
 * radials take that hue instead of Foundly green.
 */
export function Wallpaper({ tint }: { tint?: string }) {
  const style = tint
    ? ({
        background: [
          `radial-gradient(60% 48% at 4% 0%, ${rgba(tint, 0.34)} 0%, ${rgba(tint, 0)} 66%)`,
          "radial-gradient(44% 40% at 98% 2%, rgba(240, 185, 91, 0.3) 0%, rgba(240, 185, 91, 0) 66%)",
          `radial-gradient(52% 46% at 74% 100%, ${rgba(tint, 0.22)} 0%, ${rgba(tint, 0)} 66%)`,
          "radial-gradient(42% 44% at 12% 94%, rgba(160, 200, 245, 0.62) 0%, rgba(160, 200, 245, 0) 66%)",
          "linear-gradient(180deg, #f6f7f3 0%, #eef2ec 55%, #f1f0ea 100%)",
        ].join(", "),
      } as React.CSSProperties)
    : undefined;
  return (
    <>
      <div aria-hidden="true" className="ambient-bg" style={style} />
      <div aria-hidden="true" className="wallpaper-grain" />
    </>
  );
}

/** #RRGGBB → rgba(); anything else falls back to the brand green. */
function rgba(hex: string, alpha: number): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = parseInt(match ? match[1]! : "0C7A63", 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
