export function GET(request: Request) {
  const requested = Number(new URL(request.url).searchParams.get("size"));
  const size = requested === 192 ? 192 : 512;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#147059"/><stop offset="0.55" stop-color="#0C4A3E"/><stop offset="1" stop-color="#07332B"/></linearGradient><radialGradient id="glow" cx="0.5" cy="0.3" r="0.65"><stop offset="0" stop-color="#8FE3CE" stop-opacity="0.38"/><stop offset="1" stop-color="#8FE3CE" stop-opacity="0"/></radialGradient><linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.22"/><stop offset="0.45" stop-color="#fff" stop-opacity="0.04"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><linearGradient id="pin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#CBF1E4"/></linearGradient><linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7C96B"/><stop offset="1" stop-color="#DE962A"/></linearGradient><filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#03201A" flood-opacity="0.5"/></filter></defs><rect width="512" height="512" fill="url(#bg)"/><rect width="512" height="512" fill="url(#glow)"/><g filter="url(#shadow)"><path d="M256 78c-74 0-132 57-132 130 0 94 132 226 132 226s132-132 132-226c0-73-58-130-132-130z" fill="url(#pin)"/></g><path d="M256 150l15.9 41.4 44.2 2.3-34.4 27.9 11.4 42.8L256 240.3l-37.1 24.1 11.4-42.8-34.4-27.9 44.2-2.3z" fill="url(#gold)"/><rect width="512" height="512" fill="url(#gloss)"/></svg>`;
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=604800, immutable",
    },
  });
}
