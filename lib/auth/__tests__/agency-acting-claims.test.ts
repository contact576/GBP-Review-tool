import { describe, expect, it } from "vitest";
import { signSession, verifySession } from "@/lib/auth/jwt";

const base = {
  userId: "usr_1",
  workspaceId: "ws_client",
  role: "agency_admin" as const,
  isDemo: false,
  name: "Agency Admin",
  email: "agency@example.com",
  sessionVersion: 0,
};

describe("agencyWorkspaceId session claim", () => {
  it("round-trips through sign and verify while acting inside a client", async () => {
    const token = await signSession({ ...base, agencyWorkspaceId: "ws_agency" });
    const claims = await verifySession(token);
    expect(claims?.workspaceId).toBe("ws_client");
    expect(claims?.agencyWorkspaceId).toBe("ws_agency");
    expect(claims?.role).toBe("agency_admin");
  });

  it("is absent — not an empty string — on an ordinary session", async () => {
    const token = await signSession(base);
    const claims = await verifySession(token);
    expect(claims).not.toBeNull();
    expect("agencyWorkspaceId" in (claims ?? {})).toBe(false);
  });
});
