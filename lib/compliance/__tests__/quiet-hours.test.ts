import { describe, it, expect } from "vitest";
import {
  checkQuietHours,
  localHourFor,
  DEFAULT_SEND_WINDOW,
} from "../quiet-hours";

/**
 * Regression: `WorkspaceSettings.quietHours` was a toggle no send path read, so
 * a review-request SMS could fire at 3am in the recipient's local time. The
 * window is TCPA-aligned 8:00am–9:00pm and is evaluated in the LOCATION's
 * timezone, never the server's.
 */

// 2026-07-25T12:00:00Z — 08:00 in Toronto (UTC-4 in July), 05:00 in Los Angeles.
const NOON_UTC = new Date("2026-07-25T12:00:00.000Z");
// 2026-07-25T06:00:00Z — 02:00 in Toronto. The 3am-text case.
const EARLY_UTC = new Date("2026-07-25T06:00:00.000Z");

describe("localHourFor", () => {
  it("resolves the recipient's local hour, not the server's", () => {
    expect(localHourFor("America/Toronto", NOON_UTC)).toBe(8);
    expect(localHourFor("America/Los_Angeles", NOON_UTC)).toBe(5);
    expect(localHourFor("UTC", NOON_UTC)).toBe(12);
  });

  it("returns midnight as 0, never 24", () => {
    const midnightToronto = new Date("2026-07-25T04:00:00.000Z");
    expect(localHourFor("America/Toronto", midnightToronto)).toBe(0);
  });

  it("returns null for a missing or invalid timezone", () => {
    expect(localHourFor("", NOON_UTC)).toBeNull();
    expect(localHourFor("   ", NOON_UTC)).toBeNull();
    expect(localHourFor("Not/AZone", NOON_UTC)).toBeNull();
  });
});

describe("checkQuietHours", () => {
  it("blocks the 2am text in the recipient's timezone", () => {
    const decision = checkQuietHours({
      enabled: true,
      timezone: "America/Toronto",
      at: EARLY_UTC,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toMatch(/quiet hours/i);
  });

  it("allows a send inside the window", () => {
    expect(
      checkQuietHours({ enabled: true, timezone: "America/Toronto", at: NOON_UTC }).allowed,
    ).toBe(true);
  });

  it("judges the same instant differently across timezones", () => {
    // 12:00Z is 08:00 Toronto (allowed) but 05:00 Los Angeles (blocked).
    expect(
      checkQuietHours({ enabled: true, timezone: "America/Toronto", at: NOON_UTC }).allowed,
    ).toBe(true);
    expect(
      checkQuietHours({ enabled: true, timezone: "America/Los_Angeles", at: NOON_UTC }).allowed,
    ).toBe(false);
  });

  it("defers to the workspace when the guard is switched off", () => {
    expect(
      checkQuietHours({ enabled: false, timezone: "America/Toronto", at: EARLY_UTC }).allowed,
    ).toBe(true);
  });

  it("fails CLOSED when the timezone cannot be resolved", () => {
    const decision = checkQuietHours({ enabled: true, timezone: "Not/AZone", at: NOON_UTC });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toMatch(/local time/i);
  });

  it("treats the window edges as inclusive start / exclusive end", () => {
    const at = (hour: number) => {
      const utcHour = String(hour + 4).padStart(2, "0"); // Toronto is UTC-4 in July
      return new Date(`2026-07-25T${utcHour}:00:00.000Z`);
    };
    const allowedAt = (hour: number) =>
      checkQuietHours({ enabled: true, timezone: "America/Toronto", at: at(hour) }).allowed;

    expect(allowedAt(DEFAULT_SEND_WINDOW.startHour - 1)).toBe(false); // 7am
    expect(allowedAt(DEFAULT_SEND_WINDOW.startHour)).toBe(true); // 8am
    expect(allowedAt(DEFAULT_SEND_WINDOW.endHour - 1)).toBe(true); // 8pm
    expect(allowedAt(DEFAULT_SEND_WINDOW.endHour)).toBe(false); // 9pm
  });
});
