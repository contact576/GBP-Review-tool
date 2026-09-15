import { describe, it, expect } from "vitest";
import { notificationDestination } from "@/lib/notifications/destination";
import type { Notification } from "@/lib/data/types";

const ALL_KINDS: Notification["kind"][] = ["review", "feedback", "delivery", "milestone", "system"];

describe("notificationDestination", () => {
  it("gives every notification kind a destination inside the owner app", () => {
    for (const kind of ALL_KINDS) {
      const dest = notificationDestination(kind);
      expect(dest.href.startsWith("/app/"), `${kind} -> ${dest.href}`).toBe(true);
      expect(dest.label.length).toBeGreaterThan(0);
    }
  });

  it("sends reviews and private feedback to the screen that holds them", () => {
    expect(notificationDestination("review").href).toBe("/app/reviews");
    expect(notificationDestination("feedback").href).toBe("/app/reviews");
  });

  it("sends delivery outcomes to requests and milestones to milestones", () => {
    expect(notificationDestination("delivery").href).toBe("/app/requests");
    expect(notificationDestination("milestone").href).toBe("/app/milestones");
  });

  it("sends system notifications to the approval queue they refer to", () => {
    expect(notificationDestination("system").href).toBe("/app/this-week");
  });

  it("labels the destination rather than repeating the notification title", () => {
    for (const kind of ALL_KINDS) {
      expect(notificationDestination(kind).label).toMatch(/^Open /);
    }
  });
});
