// PWA web manifest for the Foundly staff app. Served at /manifest.webmanifest.

export function GET() {
  const manifest = {
    name: "Foundly",
    short_name: "Foundly",
    description: "Front-desk review capture for local businesses.",
    start_url: "/staff",
    id: "/staff",
    scope: "/staff/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F7F6F2",
    theme_color: "#0C4A3E",
    icons: [
      {
        src: "/pwa-icon?size=192",
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "any maskable",
      },
      {
        src: "/pwa-icon?size=512",
        sizes: "512x512",
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
