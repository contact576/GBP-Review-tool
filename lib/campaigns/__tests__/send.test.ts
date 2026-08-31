import { describe, expect, it, vi } from "vitest";
import type { Campaign, CampaignAudienceSnapshot, Customer, SuppressionEntry } from "@/lib/data/types";
import { buildAudienceSnapshot } from "../audience";
import { runCampaignSend, runCampaignTestSend, type CampaignTransport } from "../send";
import { consent, customer } from "./fixtures";

/**
 * The send pipeline, with both transports mocked. No test here may make a
 * network call — the point is to prove the gates fire before Resend or Twilio
 * is ever reached.
 */

const NOW_DAYTIME = new Date("2026-07-25T18:00:00.000Z"); // 2pm in Toronto
const NOW_NIGHT = new Date("2026-07-25T06:00:00.000Z"); // 2am in Toronto
const TZ = "America/Toronto";

function transport(overrides: Partial<CampaignTransport> = {}): CampaignTransport {
  return {
    emailEnabled: () => true,
    smsEnabled: () => true,
    sendEmail: vi.fn(async () => ({ ok: true as const, id: "resend_1" })),
    sendSms: vi.fn(async () => ({ ok: true as const, sid: "SM1", status: "queued" })),
    ...overrides,
  };
}

function draft(overrides: Partial<Campaign> = {}): Pick<
  Campaign,
  "id" | "name" | "channel" | "subject" | "body" | "consentBasis"
> {
  return {
    id: "camp_1",
    name: "Summer check-in",
    channel: "email",
    subject: "How have you been?",
    body: "Hi {first_name}, we would love to see you again this summer.",
    consentBasis: "marketing",
    ...overrides,
  };
}

function context(input: {
  customers: Customer[];
  suppression?: SuppressionEntry[];
  campaign?: ReturnType<typeof draft>;
  transport?: CampaignTransport;
  usage?: { smsCreditsUsed: number; smsCreditsTotal: number };
  now?: Date;
  quietHoursEnabled?: boolean;
  snapshot?: CampaignAudienceSnapshot;
}) {
  const campaign = input.campaign ?? draft();
  const suppression = input.suppression ?? [];
  const snapshot =
    input.snapshot ??
    buildAudienceSnapshot({
      customers: input.customers,
      suppression,
      consentBasis: campaign.consentBasis,
      channel: campaign.channel,
      now: input.now ?? NOW_DAYTIME,
    });
  return {
    workspaceId: "ws_1",
    campaign,
    snapshot,
    customers: input.customers,
    suppression,
    location: { name: "Harbourview Physiotherapy", timezone: TZ, address: "12 Dock St, Toronto" },
    usage: input.usage ?? { smsCreditsUsed: 0, smsCreditsTotal: 500 },
    quietHoursEnabled: input.quietHoursEnabled ?? true,
    baseUrl: "https://app.example.test",
    now: input.now ?? NOW_DAYTIME,
    transport: input.transport ?? transport(),
  };
}

describe("campaign send — consent is enforced at the transport boundary", () => {
  it("never calls the email transport for an opted-out customer", async () => {
    const rails = transport();
    const result = await runCampaignSend(
      context({
        customers: [
          customer({ id: "c_in", email: "in@example.test" }),
          customer({
            id: "c_out",
            email: "out@example.test",
            consent: consent({ marketingConsent: false }),
          }),
        ],
        transport: rails,
      }),
    );

    expect(result.counts.sent).toBe(1);
    expect(rails.sendEmail).toHaveBeenCalledTimes(1);
    const recipients = vi.mocked(rails.sendEmail).mock.calls.map(([call]) => call.to);
    expect(recipients).toEqual(["in@example.test"]);
  });

  it("skips a recipient who withdrew between the snapshot and the send", async () => {
    const optedIn = customer({ id: "c_a", email: "a@example.test" });
    const stillIn = customer({ id: "c_b", email: "b@example.test" });
    const customers = [optedIn, stillIn];
    const snapshot = buildAudienceSnapshot({
      customers,
      suppression: [],
      consentBasis: "marketing",
      channel: "email",
      now: NOW_DAYTIME,
    });
    expect(snapshot.eligible).toBe(2);

    // The unsubscribe lands after the campaign was scheduled.
    optedIn.consent = consent({ marketingConsent: false });

    const rails = transport();
    const result = await runCampaignSend(context({ customers, snapshot, transport: rails }));

    expect(result.counts.sent).toBe(1);
    expect(result.counts.skipped).toBe(1);
    expect(rails.sendEmail).toHaveBeenCalledTimes(1);
    // The frozen record still lists both — history is not rewritten.
    expect(result.delivery.snapshot?.recipients).toHaveLength(2);
    const skipped = result.delivery.snapshot?.recipients.find((r) => r.customerId === "c_a");
    expect(skipped?.outcome).toBe("skipped");
    expect(skipped?.detail).toMatch(/since this audience was captured/i);
  });
});

describe("campaign send — quiet hours", () => {
  it("holds an SMS campaign outside the recipient's local window and sends nothing", async () => {
    const rails = transport();
    const result = await runCampaignSend(
      context({
        customers: [customer({ id: "c_a" })],
        campaign: draft({ channel: "sms", body: "Quick hello from the clinic." }),
        transport: rails,
        now: NOW_NIGHT,
      }),
    );

    expect(rails.sendSms).not.toHaveBeenCalled();
    expect(result.didSend).toBe(false);
    expect(result.delivery.state).toBe("held");
    expect(result.counts.held).toBe(1);
    expect(result.counts.sent).toBe(0);
    expect(result.delivery.note).toMatch(/quiet hours/i);
    // Stays scheduled so the next drain retries it inside the window.
    expect(result.status).toBe("scheduled");
  });

  it("sends the same SMS campaign inside the window", async () => {
    const rails = transport();
    const result = await runCampaignSend(
      context({
        customers: [customer({ id: "c_a" })],
        campaign: draft({ channel: "sms", body: "Quick hello from the clinic." }),
        transport: rails,
        now: NOW_DAYTIME,
      }),
    );

    expect(rails.sendSms).toHaveBeenCalledTimes(1);
    expect(result.counts.sent).toBe(1);
    expect(result.creditsUsed).toBe(1);
  });

  it("does not hold email — quiet hours are an SMS rule", async () => {
    const rails = transport();
    const result = await runCampaignSend(
      context({ customers: [customer({ id: "c_a" })], transport: rails, now: NOW_NIGHT }),
    );
    expect(result.counts.sent).toBe(1);
  });
});

describe("campaign send — credit cap", () => {
  it("blocks an SMS send that would exceed the remaining allowance", async () => {
    const rails = transport();
    const result = await runCampaignSend(
      context({
        customers: [
          customer({ id: "c_a", phone: "+14155550101" }),
          customer({ id: "c_b", phone: "+14155550102" }),
          customer({ id: "c_c", phone: "+14155550103" }),
        ],
        campaign: draft({ channel: "sms", body: "Short note." }),
        usage: { smsCreditsUsed: 498, smsCreditsTotal: 500 },
        transport: rails,
      }),
    );

    expect(rails.sendSms).not.toHaveBeenCalled();
    expect(result.delivery.state).toBe("blocked");
    expect(result.counts.sent).toBe(0);
    expect(result.counts.skipped).toBe(3);
    expect(result.delivery.note).toMatch(/only 2 remain/i);
  });

  it("charges per segment, not per message", async () => {
    const long = "x".repeat(200);
    const rails = transport();
    const result = await runCampaignSend(
      context({
        customers: [customer({ id: "c_a" })],
        campaign: draft({ channel: "sms", body: long }),
        transport: rails,
      }),
    );
    expect(result.creditsUsed).toBe(2);
  });
});

describe("campaign send — unconfigured providers", () => {
  it("does not claim a send when RESEND_API_KEY is absent", async () => {
    const rails = transport({ emailEnabled: () => false });
    const result = await runCampaignSend(
      context({ customers: [customer({ id: "c_a" })], transport: rails }),
    );

    expect(rails.sendEmail).not.toHaveBeenCalled();
    expect(result.didSend).toBe(false);
    expect(result.counts.sent).toBe(0);
    expect(result.counts.skipped).toBe(1);
    expect(result.delivery.state).toBe("not_configured");
    expect(result.delivery.missing).toContain("RESEND_API_KEY");
    expect(result.delivery.note).toMatch(/Nothing was sent/i);
    // Still a draft, so the owner can send it once the key is added.
    expect(result.status).toBe("draft");
    // The attempt is recorded honestly rather than silently dropped.
    expect(result.delivery.attemptedAt).toBe(NOW_DAYTIME.toISOString());
  });

  it("names the missing Twilio settings for an unconfigured SMS send", async () => {
    const rails = transport({ smsEnabled: () => false });
    const result = await runCampaignSend(
      context({
        customers: [customer({ id: "c_a" })],
        campaign: draft({ channel: "sms", body: "Hello." }),
        transport: rails,
      }),
    );

    expect(rails.sendSms).not.toHaveBeenCalled();
    expect(result.delivery.state).toBe("not_configured");
    expect(result.delivery.missing).toEqual([
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER",
    ]);
    expect(result.creditsUsed).toBe(0);
  });

  it("records a per-recipient failure when the provider rejects the message", async () => {
    const rails = transport({
      sendEmail: vi.fn(async () => ({ ok: false as const, reason: "error" as const, detail: "domain not verified" })),
    });
    const result = await runCampaignSend(
      context({ customers: [customer({ id: "c_a" })], transport: rails }),
    );

    expect(result.counts.failed).toBe(1);
    expect(result.counts.sent).toBe(0);
    expect(result.delivery.snapshot?.recipients[0]?.detail).toBe("domain not verified");
  });
});

describe("campaign send — content lints", () => {
  it("blocks incentive language before any transport is touched", async () => {
    const rails = transport();
    const result = await runCampaignSend(
      context({
        customers: [customer({ id: "c_a" })],
        campaign: draft({ body: "Leave us a review and get 20% off your next visit." }),
        transport: rails,
      }),
    );

    expect(rails.sendEmail).not.toHaveBeenCalled();
    expect(result.delivery.state).toBe("blocked");
    expect(result.delivery.note).toMatch(/incentiv/i);
    expect(result.counts.sent).toBe(0);
  });

  it("allows an offer that is not tied to a review", async () => {
    const rails = transport();
    const result = await runCampaignSend(
      context({
        customers: [customer({ id: "c_a" })],
        campaign: draft({ body: "20% off your next visit this month." }),
        transport: rails,
      }),
    );
    expect(result.counts.sent).toBe(1);
  });
});

describe("campaign send — outbound message shape", () => {
  it("attaches a working unsubscribe link and the one-click header", async () => {
    const rails = transport();
    await runCampaignSend(
      context({ customers: [customer({ id: "c_a", email: "a@example.test" })], transport: rails }),
    );

    const [sent] = vi.mocked(rails.sendEmail).mock.calls[0] ?? [];
    expect(sent).toBeDefined();
    expect(sent?.listUnsubscribeUrl).toMatch(
      /^https:\/\/app\.example\.test\/api\/unsubscribe\?t=/,
    );
    expect(sent?.html).toContain(sent?.listUnsubscribeUrl ?? "never");
    expect(sent?.html).toMatch(/Unsubscribe/);
    expect(sent?.text).toMatch(/Unsubscribe: https:\/\//);
  });

  it("personalises the body and adds the STOP instruction to SMS", async () => {
    const rails = transport();
    await runCampaignSend(
      context({
        customers: [customer({ id: "c_a", name: "Sam Rivera" })],
        campaign: draft({ channel: "sms", body: "Hi {first_name}, time for a check-in." }),
        transport: rails,
      }),
    );
    const [sent] = vi.mocked(rails.sendSms).mock.calls[0] ?? [];
    expect(sent?.body).toContain("Hi Sam, time for a check-in.");
    expect(sent?.body).toMatch(/Reply STOP to opt out\./);
  });

  it("escapes owner-authored copy so campaign text cannot inject markup", async () => {
    const rails = transport();
    await runCampaignSend(
      context({
        customers: [customer({ id: "c_a" })],
        campaign: draft({ body: "<script>alert(1)</script>" }),
        transport: rails,
      }),
    );
    const [sent] = vi.mocked(rails.sendEmail).mock.calls[0] ?? [];
    expect(sent?.html).not.toContain("<script>");
    expect(sent?.html).toContain("&lt;script&gt;");
  });
});

describe("campaign send — empty audience", () => {
  it("refuses rather than reporting a successful send to nobody", async () => {
    const rails = transport();
    const result = await runCampaignSend(
      context({
        customers: [customer({ id: "c_out", consent: consent({ marketingConsent: false }) })],
        transport: rails,
      }),
    );
    expect(rails.sendEmail).not.toHaveBeenCalled();
    expect(result.delivery.state).toBe("blocked");
    expect(result.didSend).toBe(false);
  });
});

describe("campaign test send", () => {
  it("goes to the owner, is labelled a test, and consumes nothing", async () => {
    const rails = transport();
    const result = await runCampaignTestSend({
      campaign: draft(),
      destination: "owner@example.test",
      location: { name: "Harbourview Physiotherapy", timezone: TZ },
      baseUrl: "https://app.example.test",
      transport: rails,
    });

    expect(result.ok).toBe(true);
    const [sent] = vi.mocked(rails.sendEmail).mock.calls[0] ?? [];
    expect(sent?.to).toBe("owner@example.test");
    expect(sent?.subject).toMatch(/^\[TEST\] /);
    expect(sent?.html).toMatch(/TEST SEND/);
    expect(result.ok && result.note).toMatch(/not counted as a campaign send/i);
  });

  it("is honest when the provider is not connected", async () => {
    const rails = transport({ emailEnabled: () => false });
    const result = await runCampaignTestSend({
      campaign: draft(),
      destination: "owner@example.test",
      location: { name: "Harbourview Physiotherapy", timezone: TZ },
      baseUrl: "https://app.example.test",
      transport: rails,
    });

    expect(result.ok).toBe(false);
    expect(rails.sendEmail).not.toHaveBeenCalled();
    expect(result.note).toMatch(/not connected/i);
  });

  it("refuses to test-send copy that fails the incentive lint", async () => {
    const rails = transport();
    const result = await runCampaignTestSend({
      campaign: draft({ body: "Free coffee for every review!" }),
      destination: "owner@example.test",
      location: { name: "Harbourview Physiotherapy", timezone: TZ },
      baseUrl: "https://app.example.test",
      transport: rails,
    });
    expect(result.ok).toBe(false);
    expect(rails.sendEmail).not.toHaveBeenCalled();
  });
});
