/** Local helpers for rendering an agency's white-label accent color inline.
 *  (The DS Tailwind tokens are Foundly's palette; the agency's own hex needs
 *   inline styles — this is THEIR product, not Foundly's.) */

function channels(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return [12, 122, 99];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function hexTint(hex: string, alpha: number): string {
  const [r, g, b] = channels(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Mix `hex` towards `towards` by `amount` (0–1) — a lighter/darker shade of the brand. */
export function hexMix(hex: string, towards: string, amount: number): string {
  const a = channels(hex);
  const b = channels(towards);
  const t = Math.max(0, Math.min(1, amount));
  const mix = (i: 0 | 1 | 2) => Math.round(a[i] + (b[i] - a[i]) * t);
  return `#${[mix(0), mix(1), mix(2)].map((c) => c.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}
