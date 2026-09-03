import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Gmail backend contract: mint an access token from the stored refresh token,
 * POST the RFC 2822 blob, and — on invalid_grant — flag the credential so the
 * Channels page says "Reconnect Gmail" instead of every send failing quietly.
 */

const resolveEmailSender = vi.fn();
const setEmailCredentialStatus = vi.fn();
vi.mock("@/lib/email/config", () => ({
  resolveEmailSender: (...args: unknown[]) => resolveEmailSender(...args),
  setEmailCredentialStatus: (...args: unknown[]) => setEmailCredentialStatus(...args),
  envEmailConfigured: () => false,
}));

const refreshAccessToken = vi.fn();
vi.mock("@/lib/google/gbp", () => ({
  refreshAccessToken: (...args: unknown[]) => refreshAccessToken(...args),
}));

const { sendEmail, sendViaGmail, GMAIL_RECONNECT_MESSAGE } = await import("@/lib/email");

const GMAIL_CONFIG = {
  provider: "gmail" as const,
  secret: "refresh-token-1",
  fromEmail: "owner@harbourview.ca",
  fromName: "Harbourview Dental",
  googleAccount: "owner@harbourview.ca",
  status: null,
  source: "workspace" as const,
};

const INPUT = {
  to: "customer@example.com",
  subject: "How was your visit?",
  html: "<p>Hi</p>",
  text: "Hi",
  workspaceId: "ws_1",
  listUnsubscribeUrl: "https://app.example/u/abc",
};

beforeEach(() => {
  resolveEmailSender.mockReset();
  setEmailCredentialStatus.mockReset();
  refreshAccessToken.mockReset();
  refreshAccessToken.mockResolvedValue({ ok: true, data: { accessToken: "ya29.access", expiresIn: 3600 } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendViaGmail", () => {
  it("refreshes the access token and POSTs the base64url message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "gm_123" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendViaGmail(GMAIL_CONFIG, INPUT)).resolves.toEqual({ ok: true, id: "gm_123" });

    expect(refreshAccessToken).toHaveBeenCalledWith("refresh-token-1");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
    expect(init.headers.Authorization).toBe("Bearer ya29.access");
    const { raw } = JSON.parse(init.body as string) as { raw: string };
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    const message = Buffer.from(raw, "base64url").toString("utf8");
    expect(message).toContain("From: Harbourview Dental <owner@harbourview.ca>\r\n");
    expect(message).toContain("To: customer@example.com\r\n");
    expect(message).toContain("List-Unsubscribe: <https://app.example/u/abc>\r\n");
    expect(message).toContain("List-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n");
    expect(setEmailCredentialStatus).not.toHaveBeenCalled();
  });

  it("flags needs_reconnect when the refresh token is rejected (invalid_grant)", async () => {
    refreshAccessToken.mockResolvedValue({
      ok: false,
      reason: "unauthorized",
      detail: "Refresh token was revoked or expired — reconnect Google.",
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendViaGmail(GMAIL_CONFIG, INPUT);
    expect(result).toEqual({ ok: false, reason: "error", detail: GMAIL_RECONNECT_MESSAGE });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(setEmailCredentialStatus).toHaveBeenCalledWith("ws_1", "needs_reconnect", GMAIL_RECONNECT_MESSAGE);
  });

  it("flags needs_reconnect when Gmail answers the send with 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401 })));

    const result = await sendViaGmail(GMAIL_CONFIG, INPUT);
    expect(result).toMatchObject({ ok: false, reason: "error", detail: GMAIL_RECONNECT_MESSAGE });
    expect(setEmailCredentialStatus).toHaveBeenCalledWith("ws_1", "needs_reconnect", GMAIL_RECONNECT_MESSAGE);
  });

  it("does not flag an env-level sender (there is no row to flag)", async () => {
    refreshAccessToken.mockResolvedValue({ ok: false, reason: "unauthorized", detail: "revoked" });
    const result = await sendViaGmail({ ...GMAIL_CONFIG, source: "env" }, INPUT);
    expect(result.ok).toBe(false);
    expect(setEmailCredentialStatus).not.toHaveBeenCalled();
  });

  it("explains a 403 as Gmail API / scope trouble rather than a bare status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Gmail API has not been used in project", { status: 403 })),
    );
    const result = await sendViaGmail(GMAIL_CONFIG, INPUT);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ reason: "error" });
    expect((result as { detail?: string }).detail).toContain("Gmail API may not be enabled");
    expect((result as { detail?: string }).detail).toContain("Gmail API has not been used in project");
    expect(setEmailCredentialStatus).not.toHaveBeenCalled();
  });

  it("clears a stale needs_reconnect flag after a successful send", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "gm_2" }), { status: 200 })),
    );
    await expect(sendViaGmail({ ...GMAIL_CONFIG, status: "needs_reconnect" }, INPUT)).resolves.toEqual({
      ok: true,
      id: "gm_2",
    });
    expect(setEmailCredentialStatus).toHaveBeenCalledWith("ws_1", null);
  });

  it("never throws when the network fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));
    await expect(sendViaGmail(GMAIL_CONFIG, INPUT)).resolves.toEqual({
      ok: false,
      reason: "error",
      detail: "ECONNRESET",
    });
  });
});

describe("sendEmail routing", () => {
  it("routes a resolved gmail sender to the Gmail backend", async () => {
    resolveEmailSender.mockResolvedValue(GMAIL_CONFIG);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "gm_3" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendEmail(INPUT)).resolves.toEqual({ ok: true, id: "gm_3" });
    expect(fetchMock.mock.calls[0]![0]).toBe(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    );
    expect(refreshAccessToken).toHaveBeenCalledOnce();
  });
});
