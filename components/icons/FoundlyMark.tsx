/**
 * The Foundly brand mark — a location pin with a gold star at its heart
 * ("found, and reviewed") on a deep-green iOS-style squircle.
 *
 * This is the same artwork as `app/icon.svg` / `/pwa-icon`; keep the three in
 * step. Rendered inline so it scales crisply at any size and needs no request.
 */
export function FoundlyMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="fm-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#147059" />
          <stop offset="0.55" stopColor="#0C4A3E" />
          <stop offset="1" stopColor="#07332B" />
        </linearGradient>
        <radialGradient id="fm-glow" cx="0.5" cy="0.3" r="0.65">
          <stop offset="0" stopColor="#8FE3CE" stopOpacity="0.38" />
          <stop offset="1" stopColor="#8FE3CE" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="fm-gloss" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="0.45" stopColor="#ffffff" stopOpacity="0.04" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="fm-pin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#CBF1E4" />
        </linearGradient>
        <linearGradient id="fm-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F7C96B" />
          <stop offset="1" stopColor="#DE962A" />
        </linearGradient>
        <filter id="fm-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="12" stdDeviation="14" floodColor="#03201A" floodOpacity="0.5" />
        </filter>
      </defs>
      <path d="M0 256C0 45 45 0 256 0s256 45 256 256-45 256-256 256S0 467 0 256z" fill="url(#fm-bg)" />
      <path d="M0 256C0 45 45 0 256 0s256 45 256 256-45 256-256 256S0 467 0 256z" fill="url(#fm-glow)" />
      <g filter="url(#fm-shadow)">
        <path
          d="M256 78c-74 0-132 57-132 130 0 94 132 226 132 226s132-132 132-226c0-73-58-130-132-130z"
          fill="url(#fm-pin)"
        />
      </g>
      <path
        d="M256 150l15.9 41.4 44.2 2.3-34.4 27.9 11.4 42.8L256 240.3l-37.1 24.1 11.4-42.8-34.4-27.9 44.2-2.3z"
        fill="url(#fm-gold)"
      />
      <path d="M0 256C0 45 45 0 256 0s256 45 256 256-45 256-256 256S0 467 0 256z" fill="url(#fm-gloss)" />
    </svg>
  );
}
