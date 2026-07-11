/** Local helpers for rendering an agency's white-label accent color inline.
 *  (The DS Tailwind tokens are Foundly's palette; the agency's own hex needs
 *   inline styles — this is THEIR product, not Foundly's.) */

export function hexTint(hex: string, alpha: number): string {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
