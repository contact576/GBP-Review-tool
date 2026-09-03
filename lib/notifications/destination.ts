/**
 * Where a notification leads.
 *
 * A notification that only describes something is a dead end: the owner reads
 * "3 reviews no longer showing on Google" and then has to work out for
 * themselves which screen answers it. This maps every notification onto the
 * screen that actually holds the underlying record.
 *
 * The mapping is derived from `kind` alone and is exhaustive — there is no
 * fallback branch that could quietly send an owner somewhere unrelated. If a
 * new kind is added to `Notification`, this stops compiling until it is given a
 * destination, which is the intended behaviour.
 */
import type { Notification } from "@/lib/data/types";

export interface NotificationDestination {
  /** In-app route the notification refers to. */
  href: string;
  /** Verb-first label for the row's affordance — what the owner will find there. */
  label: string;
}

const DESTINATIONS: Record<Notification["kind"], NotificationDestination> = {
  // Reviews and private feedback both live on the Reviews screen — feedback in
  // its own "Private feedback" card at the top of it.
  review: { href: "/app/reviews", label: "Open reviews" },
  feedback: { href: "/app/reviews", label: "Open private feedback" },
  // Delivery outcomes (sent / failed / suppressed / held) are per-request.
  delivery: { href: "/app/requests", label: "Open requests" },
  milestone: { href: "/app/milestones", label: "Open milestones" },
  // The only system notification produced today announces new suggestions,
  // which are approved from This Week.
  system: { href: "/app/this-week", label: "Open this week" },
};

export function notificationDestination(kind: Notification["kind"]): NotificationDestination {
  return DESTINATIONS[kind];
}
