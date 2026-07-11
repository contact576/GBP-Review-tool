import type { SVGProps } from "react";

/**
 * Foundly icon set — stroked line icons, 1.7px stroke on a 24px grid,
 * round caps/joins, currentColor. No emoji anywhere in the app UI.
 */
export type IconName =
  | "home" | "sparkles" | "star" | "star-fill" | "chat" | "send" | "users"
  | "megaphone" | "chart" | "compass" | "grid" | "qr" | "file" | "gift"
  | "settings" | "bell" | "check" | "check-circle" | "x" | "chevron-right"
  | "chevron-down" | "chevron-left" | "arrow-up" | "arrow-down" | "arrow-right"
  | "plus" | "search" | "filter" | "download" | "copy" | "google" | "mail"
  | "phone" | "message" | "shield" | "lock" | "flag" | "trend" | "clock"
  | "map-pin" | "pencil" | "refresh" | "external" | "menu" | "more" | "trophy"
  | "flame" | "building" | "credit-card" | "eye" | "alert" | "leaf" | "camera";

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
  title?: string;
}

const P: Record<IconName, React.ReactNode> = {
  home: <path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  sparkles: <><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" /><path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z" /></>,
  star: <path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 17l-5.3 2.6 1-5.8L3.5 9.7l5.9-.9z" />,
  "star-fill": <path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 17l-5.3 2.6 1-5.8L3.5 9.7l5.9-.9z" fill="currentColor" stroke="none" />,
  chat: <path d="M20 15a2 2 0 0 1-2 2H8l-4 3V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" />,
  send: <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0M16 5.2a3.2 3.2 0 0 1 0 6.2M17 20a6 6 0 0 0-2.5-4.9" /></>,
  megaphone: <path d="M3 11v2a2 2 0 0 0 2 2h1l3 5 2-1-2-4h2l7 3V6l-7 3H5a2 2 0 0 0-2 2z" />,
  chart: <path d="M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6" />,
  compass: <><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></>,
  grid: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>,
  qr: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h3v3M20 14v6M17 20h3" /></>,
  file: <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5" />,
  gift: <><rect x="4" y="9" width="16" height="5" rx="1" /><path d="M5 14v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6M12 9v12M8.5 9a2.5 2.5 0 1 1 0-5C10 4 12 6 12 9 12 6 14 4 15.5 4a2.5 2.5 0 0 1 0 5" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l1.8-1.2-2-3.4-2 .8a7.5 7.5 0 0 0-2.6-1.5L14 2h-4l-.6 2.2A7.5 7.5 0 0 0 6.8 5.7l-2-.8-2 3.4L4.6 9.5a7.6 7.6 0 0 0 0 3l-1.8 1.2 2 3.4 2-.8a7.5 7.5 0 0 0 2.6 1.5L10 22h4l.6-2.2a7.5 7.5 0 0 0 2.6-1.5l2 .8 2-3.4z" /></>,
  bell: <path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 21a2 2 0 0 1-3.4 0" />,
  check: <path d="M5 12.5 10 17.5 20 6.5" />,
  "check-circle": <><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.5 2.5L16 9.5" /></>,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  "chevron-right": <path d="M9 6l6 6-6 6" />,
  "chevron-down": <path d="M6 9l6 6 6-6" />,
  "chevron-left": <path d="M15 6l-6 6 6 6" />,
  "arrow-up": <path d="M12 20V4M6 10l6-6 6 6" />,
  "arrow-down": <path d="M12 4v16M6 14l6 6 6-6" />,
  "arrow-right": <path d="M4 12h16M14 6l6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>,
  filter: <path d="M4 5h16l-6 8v6l-4-2v-4z" />,
  download: <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></>,
  google: <path d="M21 12.2c0-.7-.1-1.3-.2-2H12v3.8h5.1a4.4 4.4 0 0 1-1.9 2.9v2.4h3A9 9 0 0 0 21 12.2zM12 21a8.8 8.8 0 0 0 6.1-2.2l-3-2.4a5.4 5.4 0 0 1-8-2.8H4v2.4A9 9 0 0 0 12 21zM7.1 13.6a5.3 5.3 0 0 1 0-3.4V7.8H4a9 9 0 0 0 0 8.1zM12 7.4a4.9 4.9 0 0 1 3.4 1.3l2.6-2.5A8.7 8.7 0 0 0 12 3.9 9 9 0 0 0 4 8.3l3.1 2.4A5.4 5.4 0 0 1 12 7.4z" fill="currentColor" stroke="none" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M4 7l8 6 8-6" /></>,
  phone: <path d="M4 5c0 9 6 15 15 15a1 1 0 0 0 1-1v-3l-4-2-2 2a12 12 0 0 1-4-4l2-2-2-4H5a1 1 0 0 0-1 1z" />,
  message: <path d="M20 15a2 2 0 0 1-2 2H8l-4 3V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" />,
  shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  flag: <path d="M5 21V4M5 5h11l-2 3 2 3H5" />,
  trend: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  "map-pin": <><path d="M12 21s7-5.5 7-11a7 7 0 0 0-14 0c0 5.5 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
  pencil: <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17z" />,
  refresh: <path d="M4 12a8 8 0 0 1 13.7-5.6L20 8M20 4v4h-4M20 12a8 8 0 0 1-13.7 5.6L4 16M4 20v-4h4" />,
  external: <path d="M14 4h6v6M20 4l-8 8M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  more: <><circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" /></>,
  trophy: <path d="M7 4h10v3a5 5 0 0 1-10 0zM7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3M9 15h6M10 15l-1 5h6l-1-5" />,
  flame: <path d="M12 3s5 4 5 9a5 5 0 0 1-10 0c0-1.5.5-2.5 1.5-3.5C9 10 9 12 10 12c1.5 0 1-3.5 2-9z" />,
  building: <><rect x="5" y="3" width="14" height="18" rx="1.5" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3" /></>,
  "credit-card": <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="2.5" /></>,
  alert: <><path d="M12 3l9 16H3z" /><path d="M12 10v4M12 17h.01" /></>,
  leaf: <path d="M5 19c0-8 6-14 15-14 0 9-6 14-13 14a6 6 0 0 1-2 0zM8 16c3-4 6-6 9-7" />,
  camera: <><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="3.2" /></>,
};

export function Icon({ name, size = 20, title, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {P[name]}
    </svg>
  );
}

export default Icon;
