import { Hanken_Grotesk, Spline_Sans_Mono } from "next/font/google";

// Hanken Grotesk — everything (body, headings, hero numbers).
export const sans = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

// Spline Sans Mono — kickers, labels, and data chips ONLY.
export const mono = Spline_Sans_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-mono",
  display: "swap",
});
