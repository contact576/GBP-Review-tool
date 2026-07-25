import { LinkButton } from "@/components/ds";
import { Icon } from "@/components/icons";
import type { UnlinkedReason } from "./staff-identity";

/**
 * Honest state for a signed-in account with no roster row of its own
 * (the owner opening the front-desk app, a teammate who was never added,
 * or two teammates sharing a display name).
 *
 * It never guesses at a staff member — it explains the gap and points at the
 * one place that closes it.
 */

interface Copy {
  title: string;
  body: string;
}

function copyFor(reason: UnlinkedReason, name: string): Copy {
  switch (reason) {
    case "empty_roster":
      return {
        title: "No one is on the front-desk roster yet",
        body: `Captures you send are saved to the business, but there's no team member to credit them to. Add the people who work the desk to start tracking captures, streaks and personal QR codes.`,
      };
    case "ambiguous":
      return {
        title: "We can't tell which teammate you are",
        body: `More than one person on the roster is listed as "${name}". Until the duplicate is renamed, captures you send stay uncredited rather than being attributed to the wrong person.`,
      };
    case "no_match":
    default:
      return {
        title: `${name}, you're not on the front-desk roster`,
        body: "You're signed in and can still capture customers — those captures just aren't credited to anyone, and there's no personal streak, rank or QR code for you yet.",
      };
  }
}

export function RosterNotice({
  reason,
  name,
  canManageTeam,
  compact = false,
}: {
  reason: UnlinkedReason;
  name: string;
  canManageTeam: boolean;
  /** Tighter treatment for use above the capture form. */
  compact?: boolean;
}) {
  const { title, body } = copyFor(reason, name);

  return (
    <section
      role="status"
      className="rounded-card border border-gold/40 bg-gold-tint/60 p-4 text-left"
      aria-label="Front-desk roster status"
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-px grid size-8 shrink-0 place-items-center rounded-chip bg-gold-tint text-gold-deep">
          <Icon name="users" size={16} />
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-ink">{title}</h2>
          <p className={compact ? "mt-1 text-[13px] leading-relaxed text-sub" : "mt-1.5 text-[14px] leading-relaxed text-sub"}>
            {body}
          </p>
          {canManageTeam ? (
            <LinkButton
              href="/app/settings/team"
              variant="secondary"
              size="md"
              icon="users"
              iconRight="chevron-right"
              className="mt-3"
            >
              {reason === "ambiguous" ? "Fix the roster" : "Add me to the team"}
            </LinkButton>
          ) : (
            <p className="mt-2.5 flex items-start gap-1.5 text-[12px] leading-relaxed text-faint">
              <Icon name="flag" size={13} className="mt-0.5 shrink-0" />
              Ask the owner or a manager to add you under Settings &rarr; Team, then sign out and back in.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
