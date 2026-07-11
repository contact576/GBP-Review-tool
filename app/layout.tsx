import type { Metadata, Viewport } from "next";
import { sans, mono } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Foundly — Get found and get chosen",
    template: "%s · Foundly",
  },
  description:
    "Foundly is the AI-powered local growth platform: steady, durable Google reviews, an optimized profile, and honest proof it's working — one score, three numbers, three tasks a week.",
  applicationName: "Foundly",
  metadataBase: new URL("https://foundly.app"),
  openGraph: {
    title: "Foundly — Get found and get chosen",
    description:
      "Steady Google reviews, an optimized Google Business Profile, and honest growth — for local businesses.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0C4A3E",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
