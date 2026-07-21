import type { IconName } from "@/components/icons";

export interface NavItem {
  label: string;
  href: string;
  icon: IconName;
  pro?: boolean;
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Home",
    items: [{ label: "Dashboard", href: "/app", icon: "home" }],
  },
  {
    label: "Grow",
    items: [
      { label: "This Week", href: "/app/this-week", icon: "sparkles" },
      { label: "Campaigns", href: "/app/campaigns", icon: "megaphone" },
    ],
  },
  {
    label: "Reputation",
    items: [
      { label: "Reviews", href: "/app/reviews", icon: "chat" },
      { label: "Requests", href: "/app/requests", icon: "send" },
    ],
  },
  {
    label: "Customers",
    items: [{ label: "Customers", href: "/app/customers", icon: "users" }],
  },
  {
    label: "Insights",
    items: [
      { label: "Benchmark", href: "/app/benchmark", icon: "chart" },
      { label: "Analytics", href: "/app/analytics", icon: "trend" },
      { label: "AI Visibility", href: "/app/visibility", icon: "compass", pro: true },
      { label: "Rank Grid", href: "/app/rank-grid", icon: "grid", pro: true },
    ],
  },
  {
    label: "Studio",
    items: [
      { label: "AI Content Studio", href: "/app/studio", icon: "sparkles" },
      { label: "Growth Report", href: "/app/report", icon: "file" },
    ],
  },
];

// Mobile bottom-tab bar (5 items; "More" opens the overflow sheet).
export const BOTTOM_TABS: NavItem[] = [
  { label: "Home", href: "/app", icon: "home" },
  { label: "Tasks", href: "/app/this-week", icon: "sparkles" },
  { label: "Reviews", href: "/app/reviews", icon: "chat" },
  { label: "Customers", href: "/app/customers", icon: "users" },
];

export const MORE_ITEMS: NavItem[] = [
  { label: "Requests", href: "/app/requests", icon: "send" },
  { label: "Campaigns", href: "/app/campaigns", icon: "megaphone" },
  { label: "Benchmark", href: "/app/benchmark", icon: "chart" },
  { label: "Analytics", href: "/app/analytics", icon: "trend" },
  { label: "AI Visibility", href: "/app/visibility", icon: "compass", pro: true },
  { label: "Rank Grid", href: "/app/rank-grid", icon: "grid", pro: true },
  { label: "AI Content Studio", href: "/app/studio", icon: "sparkles" },
  { label: "Growth Report", href: "/app/report", icon: "file" },
  { label: "Milestones", href: "/app/milestones", icon: "trophy" },
  { label: "Settings", href: "/app/settings/business", icon: "settings" },
];
