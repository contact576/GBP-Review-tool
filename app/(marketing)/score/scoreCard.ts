// Self-contained shareable score-card renderer for the free Local Growth Score
// tool. Draws the user's score onto a canvas — Foundly deep-green hero, gold
// accent arc, hero score number, business name, and a "Reviews powered by
// Foundly" watermark — then downloads it as a PNG. No libraries, no emoji.
//
// Colours are the Foundly DS tokens (mirrored here because <canvas> can't read
// Tailwind classes): hero #0C4A3E, gold #E8A33D, primary #0C7A63.

const HERO = "#0C4A3E";
const HERO_DEEP = "#0A3F34";
const GOLD = "#E8A33D";
const INK = "#17201D";
const WHITE = "#FFFFFF";

const SANS = '"Spline Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const MONO = '"Spline Sans Mono", ui-monospace, "SFMono-Regular", monospace';

export interface ScoreCardData {
  business: string;
  growth: number;
  reviews: number;
  profile: number;
  bandLabel: string;
}

/** Manual rounded-rect path (avoids relying on ctx.roundRect availability). */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

/** Trim a label to fit maxWidth at the current font, adding an ellipsis. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + "…";
}

/**
 * 270° gauge matching the on-screen ScoreDial: white track, gold progress arc,
 * gap at the bottom. Angles are canvas-space (clockwise, y-down).
 */
function drawGauge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  stroke: number,
  value: number,
): void {
  const start = 0.75 * Math.PI; // 135° — bottom-left
  const full = 1.5 * Math.PI; // 270° sweep
  const end = start + (Math.max(0, Math.min(100, value)) / 100) * full;

  ctx.lineCap = "round";
  ctx.lineWidth = stroke;

  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.beginPath();
  ctx.arc(cx, cy, radius, start, start + full);
  ctx.stroke();

  ctx.strokeStyle = GOLD;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, start, end);
  ctx.stroke();
}

/** Draw the full score card into a 1080×1080 canvas context. */
export function drawScoreCard(canvas: HTMLCanvasElement, data: ScoreCardData): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const S = 1080;
  canvas.width = S;
  canvas.height = S;

  // Deep-green background with a subtle vertical depth gradient.
  const bg = ctx.createLinearGradient(0, 0, 0, S);
  bg.addColorStop(0, HERO);
  bg.addColorStop(1, HERO_DEEP);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, S, S);

  // Faint gold glow behind the gauge (the accent).
  const glow = ctx.createRadialGradient(S / 2, 560, 40, S / 2, 560, 420);
  glow.addColorStop(0, "rgba(232,163,61,0.14)");
  glow.addColorStop(1, "rgba(232,163,61,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, S, S);

  ctx.textAlign = "center";

  // Kicker.
  ctx.fillStyle = GOLD;
  ctx.font = `700 30px ${MONO}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText("LOCAL GROWTH SCORE", S / 2, 148);

  // Business name (trimmed to fit).
  ctx.fillStyle = WHITE;
  ctx.font = `700 54px ${SANS}`;
  ctx.fillText(fitText(ctx, data.business, S - 160), S / 2, 214);

  // Gauge.
  const cx = S / 2;
  const cy = 560;
  drawGauge(ctx, cx, cy, 210, 40, data.growth);

  // Hero score number + "/ 100".
  ctx.fillStyle = WHITE;
  ctx.textBaseline = "middle";
  ctx.font = `800 190px ${SANS}`;
  ctx.fillText(String(Math.round(data.growth)), cx, cy - 8);
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.font = `700 34px ${MONO}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText("/ 100", cx, cy + 128);

  // Band pill (gold, ink text).
  ctx.font = `700 30px ${SANS}`;
  const bandText = data.bandLabel.toUpperCase();
  const pillW = ctx.measureText(bandText).width + 60;
  const pillH = 58;
  const pillX = cx - pillW / 2;
  const pillY = 838;
  ctx.fillStyle = GOLD;
  roundRectPath(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.textBaseline = "middle";
  ctx.fillText(bandText, cx, pillY + pillH / 2 + 1);

  // Sub-scores: Reviews / Profile.
  const subY = 946;
  const gap = 60;
  ctx.textBaseline = "alphabetic";
  const label = (t: string) => {
    ctx.font = `700 26px ${MONO}`;
    return ctx.measureText(t).width;
  };
  const num = (t: string) => {
    ctx.font = `800 40px ${SANS}`;
    return ctx.measureText(t).width;
  };
  const reviewsLabel = "REVIEWS";
  const profileLabel = "PROFILE";
  const reviewsNum = String(Math.round(data.reviews));
  const profileNum = String(Math.round(data.profile));
  const wReviews = label(reviewsLabel) + 14 + num(reviewsNum);
  const wProfile = label(profileLabel) + 14 + num(profileNum);
  const totalW = wReviews + gap + wProfile;
  let x = cx - totalW / 2;

  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.62)";
  ctx.font = `700 26px ${MONO}`;
  ctx.fillText(reviewsLabel, x, subY);
  x += label(reviewsLabel) + 14;
  ctx.fillStyle = WHITE;
  ctx.font = `800 40px ${SANS}`;
  ctx.fillText(reviewsNum, x, subY + 2);
  x += num(reviewsNum) + gap;
  ctx.fillStyle = "rgba(255,255,255,0.62)";
  ctx.font = `700 26px ${MONO}`;
  ctx.fillText(profileLabel, x, subY);
  x += label(profileLabel) + 14;
  ctx.fillStyle = WHITE;
  ctx.font = `800 40px ${SANS}`;
  ctx.fillText(profileNum, x, subY + 2);

  // Watermark.
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = `500 30px ${SANS}`;
  ctx.fillText("Reviews powered by Foundly", cx, 1016);
}

/** Slugify a business name for the download filename. */
function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "business"
  );
}

/** Render the card to an offscreen canvas and trigger a PNG download. */
export function downloadScoreCard(data: ScoreCardData): void {
  if (typeof document === "undefined") return;
  const canvas = document.createElement("canvas");
  drawScoreCard(canvas, data);
  const url = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug(data.business)}-local-growth-score.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
