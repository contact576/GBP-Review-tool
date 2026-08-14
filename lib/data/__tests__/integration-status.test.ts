import { afterEach, describe, expect, it } from "vitest";
import { reconcileIntegrations } from "@/lib/data/integration-status";
import type { FoundlyData, Integration } from "@/lib/data/types";

const ENV_KEYS = [
  "RESEND_API_KEY",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_NUMBER",
  "TWILIO_MESSAGING_SERVICE_SID",
] as const;

const original = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function integration(provider: Integration["provider"], status: Integration["status"]): Integration {
  return { id: `int_${provider}`, locationId: "loc_1", provider, label: provider, status, detail: "seeded" };
}

/** Minimal shape — `reconcileIntegrations` only reads workspace, location and integrations. */
function makeData(overrides: {
  isDemo?: boolean;
  website?: string;
  integrations?: Integration[];
}): FoundlyData {
  return {
    workspace: { isDemo: overrides.isDemo ?? false },
    location: { website: overrides.website },
    integrations:
      overrides.integrations ??
      [
        integration("website", "disconnected"),
        integration("resend", "pending"),
        integration("twilio", "disconnected"),
        integration("google", "needs_attention"),
      ],
  } as unknown as FoundlyData;
}

function find(data: FoundlyData, provider: Integration["provider"]): Integration {
  const match = (data.integrations ?? []).find((item) => item.provider === provider);
  if (!match) throw new Error(`missing ${provider}`);
  return match;
}

describe("reconcileIntegrations", () => {
  it("marks the website tile connected once a URL is on file", () => {
    const result = reconcileIntegrations(makeData({ website: "https://www.harbourview.ca/services" }));
    const website = find(result, "website");
    expect(website.status).toBe("connected");
    // Bare host, no scheme and no www — the full URL reads as noise in a status line.
    expect(website.detail).toContain("harbourview.ca");
    expect(website.detail).not.toContain("https://");
  });

  it("leaves the website tile disconnected with no URL", () => {
    expect(find(reconcileIntegrations(makeData({})), "website").status).toBe("disconnected");
  });

  it("tolerates a website value that is not a parseable URL", () => {
    const result = reconcileIntegrations(makeData({ website: "harbourview" }));
    expect(find(result, "website").status).toBe("connected");
    expect(find(result, "website").detail).toContain("harbourview");
  });

  it("reflects email configuration on the resend tile", () => {
    delete process.env.RESEND_API_KEY;
    expect(find(reconcileIntegrations(makeData({})), "resend").status).toBe("pending");

    process.env.RESEND_API_KEY = "re_test";
    expect(find(reconcileIntegrations(makeData({})), "resend").status).toBe("connected");
  });

  it("requires a sender as well as credentials before SMS reads connected", () => {
    process.env.TWILIO_ACCOUNT_SID = "AC_test";
    process.env.TWILIO_AUTH_TOKEN = "token";
    delete process.env.TWILIO_FROM_NUMBER;
    delete process.env.TWILIO_MESSAGING_SERVICE_SID;
    expect(find(reconcileIntegrations(makeData({})), "twilio").status).toBe("disconnected");

    process.env.TWILIO_FROM_NUMBER = "+15550000000";
    expect(find(reconcileIntegrations(makeData({})), "twilio").status).toBe("connected");
  });

  it("never touches providers that own a real connect flow", () => {
    const result = reconcileIntegrations(makeData({}));
    expect(find(result, "google")).toEqual(find(makeData({}), "google"));
  });

  it("leaves demo workspaces on their curated seed values", () => {
    process.env.RESEND_API_KEY = "re_test";
    const data = makeData({ isDemo: true, website: "https://harbourview.ca" });
    expect(reconcileIntegrations(data)).toBe(data);
  });

  it("reuses the existing row when status and detail already match", () => {
    delete process.env.RESEND_API_KEY;
    const settled: Integration = {
      ...integration("resend", "pending"),
      detail: "Add a sender in Settings → Channels to start sending email",
    };
    const data = makeData({ integrations: [settled] });
    expect(find(reconcileIntegrations(data), "resend")).toBe(settled);
  });
});
