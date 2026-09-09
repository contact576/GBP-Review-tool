import type { SVGProps } from "react";
import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/icons";
import type { Channel } from "@/lib/data/types";
import type { AeoEngineId } from "@/lib/aeo/engines";

/**
 * Real brand marks, in their own colours, for every third-party product the
 * app talks about — Google, Meta, WhatsApp, the AI engines, Stripe, Twilio.
 *
 * The line-icon set (`Icon`) is monochrome by design and stays the right tool
 * for actions and objects. Brands are different: a customer scanning a QR
 * code trusts a four-colour "G" they have seen a thousand times far more than
 * a green outline that vaguely resembles it, and an owner comparing ChatGPT
 * with Gemini should see the marks they already know. Every path here is the
 * brand's own mark drawn on a 24-unit grid; none is recoloured to the theme.
 *
 * `tile` wraps the mark in a small white rounded square, which is how these
 * logos are meant to sit on a coloured button or a dark hero surface.
 */
export type BrandName =
  | "google"
  | "google-maps"
  | "gmail"
  | "search-console"
  | "facebook"
  | "meta"
  | "instagram"
  | "whatsapp"
  | "chatgpt"
  | "claude"
  | "gemini"
  | "perplexity"
  | "stripe"
  | "twilio"
  | "resend";

export const BRAND_LABEL: Record<BrandName, string> = {
  google: "Google",
  "google-maps": "Google Maps",
  gmail: "Gmail",
  "search-console": "Google Search Console",
  facebook: "Facebook",
  meta: "Meta",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Google Gemini",
  perplexity: "Perplexity",
  stripe: "Stripe",
  twilio: "Twilio",
  resend: "Resend",
};

const GOOGLE_G = (
  <>
    <path fill="#EA4335" d="M12 4.75c1.77 0 3.36.61 4.6 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.28 6.61l3.99 3.1C6.22 6.86 8.87 4.75 12 4.75z" />
    <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.13 2.74-2.39 3.59l3.86 3c2.26-2.09 3.55-5.18 3.55-8.83z" />
    <path fill="#FBBC05" d="M5.27 14.29A7.2 7.2 0 0 1 4.89 12c0-.8.14-1.57.38-2.29l-3.99-3.1A11.96 11.96 0 0 0 0 12c0 1.94.46 3.77 1.28 5.39l3.99-3.1z" />
    <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.9l-3.86-3c-1.08.72-2.46 1.15-4.08 1.15-3.13 0-5.78-2.11-6.73-4.96l-3.99 3.1C3.26 21.31 7.31 24 12 24z" />
  </>
);

const PATHS: Record<BrandName, React.ReactNode> = {
  google: GOOGLE_G,
  "search-console": GOOGLE_G,
  "google-maps": (
    <>
      <path fill="#34A853" d="M12 1.5a7.5 7.5 0 0 0-7.5 7.5c0 1.6.5 3.1 1.35 4.35L12 22.5l1.05-1.65-4.9-7.3A4.5 4.5 0 0 1 12 4.5z" />
      <path fill="#4285F4" d="M12 1.5v3a4.5 4.5 0 0 1 3.9 6.75L12 22.5l6.15-9.15A7.5 7.5 0 0 0 12 1.5z" />
      <path fill="#FBBC04" d="M8.15 13.55 12 19.3l3.9-5.8A4.5 4.5 0 0 1 8.15 13.55z" />
      <path fill="#EA4335" d="M12 4.5a4.5 4.5 0 0 0-3.85 2.2l7.7 4.55A4.5 4.5 0 0 0 12 4.5z" />
      <circle cx="12" cy="9" r="1.9" fill="#fff" />
    </>
  ),
  gmail: (
    <>
      <path fill="#4285F4" d="M2 8.4v9.35c0 .69.56 1.25 1.25 1.25H6v-8.05z" />
      <path fill="#34A853" d="M18 19h2.75c.69 0 1.25-.56 1.25-1.25V8.4l-4 2.55z" />
      <path fill="#FBBC04" d="M6 10.95V6.4l-2.4-1.8A1.5 1.5 0 0 0 2 5.8v2.6z" />
      <path fill="#C5221F" d="M18 6.4v4.55l4-2.6V5.8a1.5 1.5 0 0 0-1.6-1.2z" />
      <path fill="#EA4335" d="M6 6.4v4.55l6 4.5 6-4.5V6.4l-6 4.5z" />
    </>
  ),
  facebook: (
    <path
      fill="#1877F2"
      d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
    />
  ),
  meta: (
    <path
      fill="#0081FB"
      d="M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.358-2.602zm-10.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.088-.285z"
    />
  ),
  instagram: (
    <>
      <defs>
        <radialGradient id="fdl-ig-grad" cx="30%" cy="107%" r="150%">
          <stop offset="0%" stopColor="#FDF497" />
          <stop offset="9%" stopColor="#FDF497" />
          <stop offset="45%" stopColor="#FD5949" />
          <stop offset="60%" stopColor="#D6249F" />
          <stop offset="90%" stopColor="#285AEB" />
        </radialGradient>
      </defs>
      <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="url(#fdl-ig-grad)" />
      <circle cx="12" cy="12" r="4.6" fill="none" stroke="#fff" strokeWidth="2" />
      <circle cx="17.4" cy="6.6" r="1.25" fill="#fff" />
    </>
  ),
  whatsapp: (
    <path
      fill="#25D366"
      d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"
    />
  ),
  chatgpt: (
    <path
      fill="#10A37F"
      d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"
    />
  ),
  claude: (
    <path
      fill="#D97757"
      d="M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z"
    />
  ),
  gemini: (
    <>
      <defs>
        <linearGradient id="fdl-gemini-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4285F4" />
          <stop offset="55%" stopColor="#9B72CB" />
          <stop offset="100%" stopColor="#D96570" />
        </linearGradient>
      </defs>
      <path
        fill="url(#fdl-gemini-grad)"
        d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81"
      />
    </>
  ),
  perplexity: (
    <g fill="none" stroke="#20808D" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round">
      <path d="M12 2.5v19" />
      <path d="M12 8.5 5.5 4v5.6H3.5v8.8h2v-3.9L12 19l6.5-4.5v3.9h2V9.6h-2V4L12 8.5z" />
      <path d="M5.5 9.6h13M5.5 14.5 12 10l6.5 4.5" />
    </g>
  ),
  stripe: (
    <path
      fill="#635BFF"
      d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.594-7.305h.003z"
    />
  ),
  twilio: (
    <g fill="#F22F46">
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 20.8a8.8 8.8 0 1 1 0-17.6 8.8 8.8 0 0 1 0 17.6z" />
      <circle cx="9.1" cy="9.1" r="2.35" />
      <circle cx="14.9" cy="9.1" r="2.35" />
      <circle cx="9.1" cy="14.9" r="2.35" />
      <circle cx="14.9" cy="14.9" r="2.35" />
    </g>
  ),
  resend: (
    <path
      fill="#17201D"
      d="M4 3h8.2c3.6 0 6 2.1 6 5.3 0 2.5-1.4 4.2-3.6 4.9L20 21h-4.6l-4.8-7.1H8.1V21H4zm4.1 3.5v4.2h3.7c1.6 0 2.5-.8 2.5-2.1 0-1.3-.9-2.1-2.5-2.1z"
    />
  ),
};

interface BrandLogoProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: BrandName;
  size?: number;
  /** Sit the mark on a white rounded tile — for coloured buttons and dark surfaces. */
  tile?: boolean;
  /** Accessible name; defaults to the brand's name. Pass "" for decorative use beside its label. */
  title?: string;
}

export function BrandLogo({ name, size = 18, tile, title, className, ...rest }: BrandLogoProps) {
  const label = title === undefined ? BRAND_LABEL[name] : title;
  const svg = (
    <svg
      width={tile ? Math.round(size * 0.62) : size}
      height={tile ? Math.round(size * 0.62) : size}
      viewBox="0 0 24 24"
      role={label ? "img" : undefined}
      aria-hidden={label ? undefined : true}
      aria-label={label || undefined}
      className={tile ? undefined : cn("shrink-0", className)}
      {...rest}
    >
      {label ? <title>{label}</title> : null}
      {PATHS[name]}
    </svg>
  );
  if (!tile) return svg;
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-[6px] bg-white shadow-sm", className)}
      style={{ width: size, height: size }}
    >
      {svg}
    </span>
  );
}

/**
 * The mark for a delivery channel. Email and SMS have no brand (they are
 * protocols), so they keep their line icons; WhatsApp is a product, so it
 * gets its own green mark.
 */
export function ChannelLogo({ channel, size = 16, className }: { channel: Channel; size?: number; className?: string }) {
  if (channel === "whatsapp") return <BrandLogo name="whatsapp" size={size} className={className} title="" />;
  return <Icon name={channel === "email" ? "mail" : "message"} size={size} className={className} />;
}

export const CHANNEL_LABEL: Record<Channel, string> = {
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
};

const ENGINE_BRAND: Record<AeoEngineId, BrandName> = {
  openai: "chatgpt",
  anthropic: "claude",
  google: "gemini",
  perplexity: "perplexity",
};

/** The product mark for an AI Visibility engine. */
export function EngineLogo({ engineId, size = 16, className }: { engineId: AeoEngineId; size?: number; className?: string }) {
  return <BrandLogo name={ENGINE_BRAND[engineId]} size={size} className={className} title="" />;
}
