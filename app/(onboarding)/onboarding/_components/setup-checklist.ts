import { emailEnabled } from "@/lib/email";
import { smsEnabled } from "@/lib/sms/twilio";
import { resolveWorkspaceIndustry } from "@/lib/industries";
import { funnelCounts } from "@/lib/data/selectors";
import type { IconName } from "@/components/icons";
import type { FoundlyData } from "@/lib/data/types";

/**
 * Onboarding completion, derived ONLY from workspace state.
 *
 * Nothing here is assumed from "the user reached this screen" — every item
 * reads a signal the data layer genuinely exposes, so a visitor who skipped
 * every step sees an honest 0/7, and the finish screen's celebration is only
 * ever shown when it has actually been earned.
 *
 * Server-only: reads the platform delivery adapters (`emailEnabled` /
 * `smsEnabled`) alongside the workspace's stored integration rows.
 */

export interface SetupItem {
  key: string;
  /** Wizard step this maps to (1-based — matches ONBOARDING_STEPS order). */
  step: number;
  icon: IconName;
  done: boolean;
  /** State-accurate label — reads differently when done vs still to do. */
  label: string;
  /** The concrete signal behind that state, in the owner's language. */
  detail: string;
  /** Where the owner goes to change it. */
  href: string;
  /** Lower = more valuable to do next. */
  priority: number;
}

export interface NextAction {
  label: string;
  detail: string;
  href: string;
  icon: IconName;
  /**
   * True only for the genuine post-setup milestone ("send your first real
   * invite"), which is the one moment allowed to use gold. Remaining setup
   * work is never dressed up as a celebration.
   */
  earned: boolean;
}

export interface SetupChecklist {
  items: SetupItem[];
  completed: number;
  total: number;
  allComplete: boolean;
  /** Per-step completion, index 0 = step 1 — feeds StepTimeline. */
  stepDone: boolean[];
  /** Highest-value thing left to do, or null when nothing is outstanding. */
  next: NextAction | null;
  /** A review request that actually reached a customer who isn't the owner. */
  firstInviteSent: boolean;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function buildSetupChecklist(data: FoundlyData): SetupChecklist {
  const { location, workspace, qrAssets, requests, staff, invites, customers } = data;
  const integrations = data.integrations ?? [];

  // ── Raw signals ──────────────────────────────────────────────────
  const googleIntegration = integrations.find((i) => i.provider === "google");
  const emailIntegration = integrations.find((i) => i.provider === "resend");
  const smsIntegration = integrations.find((i) => i.provider === "twilio");

  const placeLinked = Boolean(location.googlePlaceId);
  const industryKey = workspace.vertical.trim();
  const industryLabel = industryKey
    ? resolveWorkspaceIndustry(industryKey, {
        label: workspace.industryConfig?.customLabel,
        services: workspace.industryConfig?.customServices,
        attributes: workspace.industryConfig?.customAttributes,
      }).label
    : "";
  const gbpConnected = location.gbpConnected || googleIntegration?.status === "connected";
  const emailLive = emailIntegration?.status === "connected" || emailEnabled();
  const smsLive = smsIntegration?.status === "connected" || smsEnabled();
  const locationQr = qrAssets.find((q) => q.scope === "location" && !q.degraded);
  const pendingInvites = invites.filter((i) => i.status === "pending");

  // A request only counts as "sent" once it reached the customer — queued,
  // suppressed and failed requests never left the building.
  const sentTotal = funnelCounts(requests).sent;
  // The onboarding test invite is addressed to the owner's own inbox, so
  // "your first REAL invite" means one that went to somebody else.
  const ownerEmail = data.owner.email.trim().toLowerCase();
  const ownCustomerIds = new Set(
    ownerEmail
      ? customers
          .filter((c) => {
            const email = (c.email ?? "").trim().toLowerCase();
            return email.length > 0 && email === ownerEmail;
          })
          .map((c) => c.id)
      : [],
  );
  const sentToOthers = funnelCounts(
    requests.filter((r) => !ownCustomerIds.has(r.customerId)),
  ).sent;

  // ── Checklist ────────────────────────────────────────────────────
  const items: SetupItem[] = [
    {
      key: "business",
      step: 1,
      icon: "search",
      done: placeLinked,
      label: placeLinked ? "Business matched on Google" : "Match your business on Google",
      detail: placeLinked
        ? `Your Google listing is linked — invites and QR scans land on ${location.name}'s review page.`
        : "No Google listing linked yet, so review links have nowhere to send people.",
      href: "/onboarding/find-business",
      priority: 1,
    },
    {
      key: "business-type",
      step: 2,
      icon: "grid",
      done: industryKey.length > 0,
      label: industryKey.length > 0 ? "Business type set" : "Choose your business type",
      detail:
        industryKey.length > 0
          ? `Review prompts and the attribute catalog are tuned for ${industryLabel}.`
          : "Pick an industry so review prompts and customer attributes match your work.",
      href: "/onboarding/business-type",
      priority: 6,
    },
    {
      key: "google",
      step: 3,
      icon: "google",
      done: gbpConnected,
      label: gbpConnected
        ? "Google Business Profile connected"
        : "Connect your Google Business Profile",
      detail: gbpConnected
        ? googleIntegration?.detail || "Reviews and profile performance sync from Google."
        : googleIntegration?.detail ||
          "Connect to import your reviews, photos and profile performance.",
      href: "/onboarding/connect",
      priority: 4,
    },
    {
      key: "channels",
      step: 4,
      icon: "send",
      done: emailLive || smsLive,
      label: emailLive || smsLive ? "Invites can send" : "No delivery channel is live yet",
      detail:
        emailLive && smsLive
          ? "Email and SMS delivery are both live."
          : emailLive
            ? "Email delivery is live — invites go out the moment a visit is logged."
            : smsLive
              ? "SMS delivery is live — invites go out by text."
              : emailIntegration?.detail ||
                "Requests will queue until the email service is configured.",
      href: "/onboarding/channels",
      priority: 7,
    },
    {
      key: "qr-kit",
      step: 5,
      icon: "qr",
      done: Boolean(locationQr),
      label: locationQr ? "QR kit ready to print" : "No QR code for this location yet",
      detail: locationQr
        ? `Front-desk code /q/${locationQr.slug} — every scan starts a fresh review session.`
        : "Your QR code appears here once your workspace finishes setting up.",
      href: "/onboarding/qr-kit",
      priority: 2,
    },
    {
      key: "test-invite",
      step: 6,
      icon: "eye",
      done: requests.length > 0,
      label: requests.length > 0 ? "Review page tested" : "Try your review page",
      detail:
        requests.length > 0
          ? `${plural(requests.length, "review request", "review requests")} created in this workspace so far.`
          : "No review request exists yet — preview the page your customers land on.",
      href: "/onboarding/test-invite",
      priority: 3,
    },
    {
      key: "team",
      step: 7,
      icon: "users",
      done: staff.length > 0 || pendingInvites.length > 0,
      label: staff.length > 0 || pendingInvites.length > 0 ? "Team invited" : "Invite your team",
      detail:
        staff.length > 0 || pendingInvites.length > 0
          ? [
              staff.length > 0 ? `${plural(staff.length, "teammate", "teammates")} on the team` : "",
              pendingInvites.length > 0
                ? `${plural(pendingInvites.length, "invite", "invites")} pending`
                : "",
            ]
              .filter(Boolean)
              .join(" · ") + "."
          : "It's just you so far — teammates get their own QR code and leaderboard spot.",
      href: "/onboarding/team",
      priority: 5,
    },
  ];

  const completed = items.filter((item) => item.done).length;
  const total = items.length;
  const allComplete = completed === total;

  const stepDone = [...items].sort((a, b) => a.step - b.step).map((item) => item.done);

  const firstInviteSent = sentToOthers > 0;

  // The single most valuable thing left. Outstanding setup always wins; once
  // setup is genuinely finished the remaining move is the one that earns real
  // reviews — and only that one is allowed to celebrate.
  const outstanding = items
    .filter((item) => !item.done)
    .sort((a, b) => a.priority - b.priority)[0];

  const next: NextAction | null = outstanding
    ? {
        label: outstanding.label,
        detail: outstanding.detail,
        href: outstanding.href,
        icon: outstanding.icon,
        earned: false,
      }
    : firstInviteSent
      ? null
      : {
          label: "Send your first real invite",
          detail:
            sentTotal > 0
              ? "Your test invite went out. Now add a real customer and send them one."
              : "Add a customer and send them a review request — that's the move that earns reviews.",
          href: "/app/customers",
          icon: "star-fill",
          earned: true,
        };

  return { items, completed, total, allComplete, stepDone, next, firstInviteSent };
}
