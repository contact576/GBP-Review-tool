/**
 * Quiet-hours enforcement for outbound SMS.
 *
 * WHY THIS EXISTS: `WorkspaceSettings.quietHours` was a toggle that no send
 * path ever read, so a review-request SMS could fire at 3am local time. US TCPA
 * and Canadian CASL both constrain when commercial messages may be sent, and
 * the window is measured in the RECIPIENT's local time — which for a local
 * business is the location's timezone, not the server's.
 *
 * The window below is the TCPA-aligned 8:00am–9:00pm local. `endHour` is
 * exclusive, so the last sendable hour is 20 (8:00–8:59pm).
 *
 * SCOPE: SMS only. Email is not time-restricted by TCPA/CASL in the same way,
 * and holding email would degrade the product for no compliance gain.
 *
 * FAIL-CLOSED: if the location's timezone cannot be resolved we hold the
 * message rather than guess. This is a legal control, so "we could not verify
 * the recipient's local time" must not silently become "send it anyway". The
 * timezone is always populated by the data layer, so this should never fire in
 * practice — and when it does, the returned reason names the cause.
 */

export interface QuietHoursWindow {
  /** First local hour (0–23) at which sending is allowed. Inclusive. */
  startHour: number;
  /** First local hour (0–23) at which sending stops. Exclusive. */
  endHour: number;
}

/** TCPA-aligned 8:00am–9:00pm local. */
export const DEFAULT_SEND_WINDOW: QuietHoursWindow = { startHour: 8, endHour: 21 };

/**
 * The recipient's local hour (0–23) in an IANA timezone, or null when the
 * timezone is missing/invalid. Uses `hourCycle: "h23"` so midnight is 0, never
 * the "24" that some locales return under `hour12: false`.
 */
export function localHourFor(timezone: string, at: Date): number | null {
  if (!timezone.trim()) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(at);
    const raw = parts.find((part) => part.type === "hour")?.value;
    if (raw === undefined) return null;
    const hour = Number(raw);
    return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null;
  } catch {
    // Invalid IANA zone — Intl throws a RangeError.
    return null;
  }
}

export type QuietHoursDecision =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * Decide whether an SMS may be sent right now for a location.
 *
 * `enabled === false` means the workspace has deliberately turned the guard
 * off, and we defer to that choice.
 */
export function checkQuietHours(input: {
  enabled: boolean;
  timezone: string;
  at: Date;
  window?: QuietHoursWindow;
}): QuietHoursDecision {
  if (!input.enabled) return { allowed: true };

  const window = input.window ?? DEFAULT_SEND_WINDOW;
  const hour = localHourFor(input.timezone, input.at);
  if (hour === null) {
    return {
      allowed: false,
      reason:
        "Held: we could not confirm this customer's local time, so the message was not sent outside verified sending hours.",
    };
  }

  if (hour >= window.startHour && hour < window.endHour) return { allowed: true };

  return {
    allowed: false,
    reason: `Held for quiet hours — it is ${formatHour(hour)} for this customer. Texts send between ${formatHour(window.startHour)} and ${formatHour(window.endHour)} local time.`,
  };
}

/** "8 AM" / "9 PM" — plain language for owner-facing status text. */
function formatHour(hour24: number): string {
  const normalized = ((hour24 % 24) + 24) % 24;
  const suffix = normalized < 12 ? "AM" : "PM";
  const display = normalized % 12 === 0 ? 12 : normalized % 12;
  return `${display} ${suffix}`;
}
