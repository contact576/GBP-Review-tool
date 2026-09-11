import type { Config } from "tailwindcss";

/**
 * Foundly Design System — semantic tokens.
 * Components MUST reference these tokens, never raw hex.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#17201D",
        sub: "#5C6663",
        faint: "#8A938F",
        paper: "#F7F6F2", // warm app canvas — NOT stark white
        card: "#FFFFFF",
        hairline: "#E7E5DE",
        primary: {
          DEFAULT: "#0C7A63",
          dark: "#085546",
          tint: "#E3F0EB",
          wash: "#F0F6F3",
          mint: "#8FE3CE",
        },
        gold: {
          DEFAULT: "#E8A33D",
          deep: "#C77E1B",
          tint: "#FBF1DE",
        },
        danger: {
          DEFAULT: "#C4452F",
          tint: "#FAEAE6",
        },
        star: "#E9A13B",
        hero: "#0C4A3E", // deep-green dashboard hero card
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["Iowan Old Style", "Baskerville", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        card: "20px", // glass panels
        panel: "20px",
        sheet: "28px",
        btn: "999px", // capsule buttons
        input: "14px",
        chip: "999px",
      },
      boxShadow: {
        // Two-level elevation (see DESIGN.md). `halo` is the Level-2+ layered
        // shadow reserved for the surfaces that genuinely lift off the page:
        // drawers, modals, toasts, and the deep-green hero card.
        sm: "0 1px 2px rgba(23,32,29,.05)",
        lg: "0 10px 28px rgba(23,32,29,.07)",
        halo: "0 24px 48px rgba(23,32,29,.10)",
        // Glass elevation: rim (white inner + faint ink outer) and a soft, long drop.
        glass:
          "inset 0 1px 0 rgba(255,255,255,.9), 0 0 0 1px rgba(23,32,29,.06), 0 12px 32px -14px rgba(23,32,29,.16)",
        "glass-lg":
          "inset 0 1px 0 rgba(255,255,255,.9), 0 0 0 1px rgba(23,32,29,.07), 0 24px 60px -20px rgba(23,32,29,.28)",
      },
      transitionDuration: {
        "150": "150ms",
        "250": "250ms",
        "350": "350ms",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        rise: {
          from: { opacity: "0", transform: "translateY(10px) scale(0.992)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
      },
      animation: {
        "fade-in": "fade-in 250ms ease-out",
        "slide-up": "slide-up 250ms ease-out",
        "slide-in-right": "slide-in-right 250ms ease-out",
        rise: "rise 480ms cubic-bezier(0.2,0.7,0.2,1) both",
      },
    },
  },
  plugins: [],
};

export default config;
