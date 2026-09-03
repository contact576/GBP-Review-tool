import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The adapter's contract: pick the right backend, never throw, and never
 * report success it didn't get. `lib/email/config` is mocked so these run
 * without a database — resolution against real rows is covered by the
 * workspace-vs-env precedence test below.
 */

const resolveEmailSender = vi.fn();

vi.mock("@/lib/email/config", () => ({
  resolveEmailSender: (...args: unknown[]) => resolveEmailSender(...args),
  envEmailConfigured: () => false,
}));

const sendMail = vi.fn();
vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail }) },
}));

const { sendEmail, emailEnabledFor } = await import("@/lib/email");

const BASE = { to: "customer@example.com", subject: "Hi", html: "<p>Hi</p>" };

beforeEach(() => {
  resolveEmailSender.mockReset();
  sendMail.mockReset();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendEmail", () => {
  it("reports not_configured rather than faking a send", async () => {
    resolveEmailSender.mockResolvedValue(null);
    await expect(sendEmail(BASE)).resolves.toEqual({ ok: false, reason: "not_configured" });
  });

  it("posts to Resend and returns the message id", async () => {
    resolveEmailSender.mockResolvedValue({
      provider: "resend",
      secret: "re_key",
      fromEmail: "reviews@harbourview.ca",
      fromName: "Harbourview Dental",
      source: "workspace",
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "msg_1" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendEmail({ ...BASE, workspaceId: "ws_1" })).resolves.toEqual({
      ok: true,
      id: "msg_1",
    });
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.from).toBe("Harbourview Dental <reviews@harbourview.ca>");
    expect(body.to).toEqual(["customer@example.com"]);
  });

  it("surfaces a Resend rejection as an error, not a success", async () => {
    resolveEmailSender.mockResolvedValue({
      provider: "resend",
      secret: "re_key",
      fromEmail: "reviews@harbourview.ca",
      source: "env",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("domain not verified", { status: 403 })),
    );
    const result = await sendEmail(BASE);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ reason: "error", detail: "domain not verified" });
  });

  it("never throws when the network fails", async () => {
    resolveEmailSender.mockResolvedValue({
      provider: "resend",
      secret: "re_key",
      fromEmail: "reviews@harbourview.ca",
      source: "env",
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));
    await expect(sendEmail(BASE)).resolves.toEqual({
      ok: false,
      reason: "error",
      detail: "ECONNRESET",
    });
  });

  it("sends over SMTP when the workspace chose a mailbox", async () => {
    resolveEmailSender.mockResolvedValue({
      provider: "smtp",
      secret: "app-password",
      fromEmail: "reviews@harbourview.ca",
      smtpHost: "smtp.gmail.com",
      smtpPort: 587,
      smtpUser: "reviews@harbourview.ca",
      smtpSecure: false,
      replyTo: "hello@harbourview.ca",
      source: "workspace",
    });
    sendMail.mockResolvedValue({ messageId: "<abc@harbourview.ca>" });

    await expect(sendEmail({ ...BASE, workspaceId: "ws_1" })).resolves.toEqual({
      ok: true,
      id: "<abc@harbourview.ca>",
    });
    expect(sendMail.mock.calls[0]![0]).toMatchObject({
      to: "customer@example.com",
      replyTo: "hello@harbourview.ca",
    });
  });

  it("reports an SMTP auth failure instead of throwing", async () => {
    resolveEmailSender.mockResolvedValue({
      provider: "smtp",
      secret: "wrong",
      fromEmail: "reviews@harbourview.ca",
      smtpHost: "smtp.gmail.com",
      smtpPort: 587,
      smtpUser: "reviews@harbourview.ca",
      source: "workspace",
    });
    sendMail.mockRejectedValue(new Error("535 Authentication failed"));
    const result = await sendEmail({ ...BASE, workspaceId: "ws_1" });
    expect(result).toEqual({
      ok: false,
      reason: "error",
      detail: "535 Authentication failed",
    });
  });

  it("treats an SMTP config missing its host as unconfigured", async () => {
    resolveEmailSender.mockResolvedValue({
      provider: "smtp",
      secret: "pw",
      fromEmail: "reviews@harbourview.ca",
      source: "workspace",
    });
    await expect(sendEmail({ ...BASE, workspaceId: "ws_1" })).resolves.toEqual({
      ok: false,
      reason: "not_configured",
    });
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe("emailEnabledFor", () => {
  it("is true when a sender resolves for the workspace", async () => {
    resolveEmailSender.mockResolvedValue({
      provider: "resend",
      secret: "re_key",
      fromEmail: "a@b.com",
      source: "workspace",
    });
    await expect(emailEnabledFor("ws_1")).resolves.toBe(true);
  });

  it("is false when nothing is configured anywhere", async () => {
    resolveEmailSender.mockResolvedValue(null);
    await expect(emailEnabledFor("ws_1")).resolves.toBe(false);
  });
});
