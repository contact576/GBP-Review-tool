import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Resolver precedence and the client-safe view, against a mocked single-row
 * lookup: a workspace's own Gmail grant must beat the deployment's env sender,
 * and a revoked grant must still resolve (honest failure) rather than quietly
 * falling back to a different From address.
 */

let rows: Array<Record<string, unknown>> = [];
vi.mock("@/lib/db/client", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => rows,
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/google/crypto", () => ({
  encryptSecret: (v: string) => `enc:${v}`,
  decryptSecret: (v: string) => (v.startsWith("enc:") ? v.slice(4) : null),
}));

const { resolveEmailSender, readEmailSettings, describeEmailSender } = await import(
  "@/lib/email/config"
);

const GMAIL_ROW = {
  workspaceId: "ws_1",
  provider: "gmail",
  encryptedSecret: "enc:refresh-1",
  fromEmail: "owner@harbourview.ca",
  fromName: "Harbourview Dental",
  replyTo: null,
  smtpHost: null,
  smtpPort: null,
  smtpUser: null,
  smtpSecure: null,
  googleAccount: "owner@harbourview.ca",
  scopes: "https://www.googleapis.com/auth/gmail.send openid email",
  connectedAt: "2026-09-03T10:00:00.000Z",
  status: null,
  verifiedAt: "2026-09-03T10:00:05.000Z",
  lastError: null,
  createdAt: "2026-09-03T10:00:00.000Z",
  updatedAt: "2026-09-03T10:00:05.000Z",
};

const ENV_KEYS = ["RESEND_API_KEY", "EMAIL_FROM", "SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"] as const;
const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  rows = [];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("resolveEmailSender", () => {
  it("prefers the workspace's Gmail grant over the env Resend key", async () => {
    process.env.RESEND_API_KEY = "re_env";
    process.env.EMAIL_FROM = "Foundly <noreply@foundly.app>";
    rows = [GMAIL_ROW];

    const config = await resolveEmailSender("ws_1");
    expect(config).toMatchObject({
      provider: "gmail",
      secret: "refresh-1",
      fromEmail: "owner@harbourview.ca",
      fromName: "Harbourview Dental",
      googleAccount: "owner@harbourview.ca",
      status: null,
      source: "workspace",
    });
  });

  it("falls back to env when the workspace has no row", async () => {
    process.env.RESEND_API_KEY = "re_env";
    rows = [];
    await expect(resolveEmailSender("ws_1")).resolves.toMatchObject({
      provider: "resend",
      secret: "re_env",
      source: "env",
    });
  });

  it("still resolves a needs_reconnect Gmail row (honest failure beats silent fallback)", async () => {
    process.env.RESEND_API_KEY = "re_env";
    rows = [{ ...GMAIL_ROW, status: "needs_reconnect", verifiedAt: null }];
    await expect(resolveEmailSender("ws_1")).resolves.toMatchObject({
      provider: "gmail",
      status: "needs_reconnect",
      source: "workspace",
    });
  });

  it("falls through to env when the stored secret no longer decrypts", async () => {
    process.env.RESEND_API_KEY = "re_env";
    rows = [{ ...GMAIL_ROW, encryptedSecret: "v1.garbage" }];
    await expect(resolveEmailSender("ws_1")).resolves.toMatchObject({ provider: "resend", source: "env" });
  });

  it("is null with neither a row nor env", async () => {
    await expect(resolveEmailSender("ws_1")).resolves.toBeNull();
  });
});

describe("readEmailSettings", () => {
  it("exposes the Gmail mailbox and reconnect state without the secret", async () => {
    rows = [{ ...GMAIL_ROW, status: "needs_reconnect", verifiedAt: null, lastError: "revoked" }];
    const view = await readEmailSettings("ws_1");
    expect(view).toMatchObject({
      configured: true,
      provider: "gmail",
      googleAccount: "owner@harbourview.ca",
      connectedAt: "2026-09-03T10:00:00.000Z",
      needsReconnect: true,
      verified: false,
      lastError: "revoked",
      envFallback: false,
    });
    expect(JSON.stringify(view)).not.toContain("refresh-1");
    expect(JSON.stringify(view)).not.toContain("enc:");
  });

  it("reports a healthy verified Gmail sender", async () => {
    rows = [GMAIL_ROW];
    await expect(readEmailSettings("ws_1")).resolves.toMatchObject({
      provider: "gmail",
      needsReconnect: false,
      verified: true,
    });
  });
});

describe("describeEmailSender", () => {
  it("names the Gmail mailbox for the Integrations tile", () => {
    expect(
      describeEmailSender({
        provider: "gmail",
        secret: "x",
        fromEmail: "owner@harbourview.ca",
        googleAccount: "owner@harbourview.ca",
        source: "workspace",
      }),
    ).toBe("Gmail · owner@harbourview.ca");
  });

  it("unwraps a display-name From for the other providers", () => {
    expect(
      describeEmailSender({
        provider: "resend",
        secret: "x",
        fromEmail: "Foundly <noreply@foundly.app>",
        source: "env",
      }),
    ).toBe("Resend · noreply@foundly.app");
    expect(
      describeEmailSender({ provider: "smtp", secret: "x", fromEmail: "a@b.com", source: "workspace" }),
    ).toBe("SMTP · a@b.com");
  });
});
