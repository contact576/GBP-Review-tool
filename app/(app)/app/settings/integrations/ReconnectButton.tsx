import { LinkButton } from "@/components/ds/Button";
import type { Integration } from "@/lib/data/types";

/**
 * Real connect/manage action per provider — routes to the actual flow, no
 * fake spinner. Providers without a live self-serve action (SMS) point at the
 * setup guide so the owner always lands somewhere real.
 */
const TARGET: Record<
  Integration["provider"],
  { connected: { href: string; label: string; icon: "settings" | "refresh" | "external" }; disconnected: { href: string; label: string; icon: "settings" | "refresh" | "external" } }
> = {
  google: {
    connected: { href: "/api/google/connect", label: "Reconnect", icon: "refresh" },
    disconnected: { href: "/api/google/connect", label: "Connect", icon: "refresh" },
  },
  google_places: {
    connected: { href: "/onboarding/find-business", label: "Manage", icon: "settings" },
    disconnected: { href: "/onboarding/find-business", label: "Find business", icon: "refresh" },
  },
  resend: {
    connected: { href: "/setup", label: "Manage", icon: "settings" },
    disconnected: { href: "/setup", label: "Set up", icon: "external" },
  },
  twilio: {
    connected: { href: "/setup", label: "Manage", icon: "settings" },
    disconnected: { href: "/setup", label: "Set up", icon: "external" },
  },
  stripe: {
    connected: { href: "/app/settings/billing", label: "Manage", icon: "settings" },
    disconnected: { href: "/app/settings/billing", label: "Set up", icon: "external" },
  },
};

export function ReconnectButton({
  provider,
  connected,
}: {
  provider: Integration["provider"];
  label: string;
  connected: boolean;
}) {
  const t = connected ? TARGET[provider].connected : TARGET[provider].disconnected;
  return (
    <LinkButton
      href={t.href}
      variant={connected ? "ghost" : "secondary"}
      size="sm"
      icon={t.icon}
    >
      {t.label}
    </LinkButton>
  );
}
