// PWA web manifest for the Foundly staff app. Served at /manifest.webmanifest.

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#0C4A3E"/><text x="50%" y="50%" dy="0.34em" text-anchor="middle" font-family="system-ui,Arial,sans-serif" font-size="300" font-weight="700" fill="#E0A93F">F</text></svg>`;

const ICON_SRC = `data:image/svg+xml,${encodeURIComponent(ICON_SVG)}`;

export function GET() {
  const manifest = {
    name: "Foundly",
    short_name: "Foundly",
    description: "Front-desk review capture for local businesses.",
    start_url: "/staff",
    scope: "/staff",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F7F6F2",
    theme_color: "#0C4A3E",
    icons: [
      {
        src: ICON_SRC,
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any maskable",
      },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
