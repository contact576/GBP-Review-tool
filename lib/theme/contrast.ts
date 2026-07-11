/** WCAG contrast helpers for the agency white-label validator. */

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]: [number, number, number]): number {
  const a = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0]! + 0.7152 * a[1]! + 0.0722 * a[2]!;
}

export function contrastRatio(fg: string, bg: string): number {
  const l1 = luminance(hexToRgb(fg));
  const l2 = luminance(hexToRgb(bg));
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** Auto-derive readable ink/white text for a branded fill. */
export function readableText(bg: string): "#17201D" | "#FFFFFF" {
  return contrastRatio("#FFFFFF", bg) >= 4.5 ? "#FFFFFF" : "#17201D";
}

/** Validate a brand color against the paper canvas + white card (AA large ≥3:1). */
export function validateBrandColor(hex: string): { valid: boolean; ratioPaper: number; ratioWhite: number } {
  const ratioPaper = contrastRatio(hex, "#F7F6F2");
  const ratioWhite = contrastRatio(hex, "#FFFFFF");
  return { valid: ratioPaper >= 3 && ratioWhite >= 3, ratioPaper, ratioWhite };
}

export function isValidHex(hex: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex);
}
