export function GET(request: Request) {
  const requested = Number(new URL(request.url).searchParams.get("size"));
  const size = requested === 192 ? 192 : 512;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#0C4A3E"/><circle cx="256" cy="256" r="142" fill="#123E35" stroke="#8FE3CE" stroke-width="12"/><path d="M180 150h170v54H244v66h92v53h-92v112h-64z" fill="#F7F6F2"/><circle cx="356" cy="154" r="30" fill="#E0A93F"/></svg>`;
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=604800, immutable",
    },
  });
}
