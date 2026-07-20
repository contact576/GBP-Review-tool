import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { verifyWebhook } from "@/lib/billing/stripe";

const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
});

function signature(payload: string, timestamp: number, secret: string): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
}

describe("Stripe webhook verification", () => {
  it("accepts a current valid v1 signature", () => {
    const secret = "whsec_test";
    const now = 1_800_000_000;
    const payload = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
    process.env.STRIPE_WEBHOOK_SECRET = secret;

    expect(
      verifyWebhook(payload, `t=${now},v1=${signature(payload, now, secret)}`, now),
    ).toEqual({ ok: true, event: JSON.parse(payload) });
  });

  it("accepts key-rotation headers when any v1 signature matches", () => {
    const secret = "whsec_rotated";
    const now = 1_800_000_000;
    const payload = JSON.stringify({ id: "evt_2" });
    process.env.STRIPE_WEBHOOK_SECRET = secret;

    const result = verifyWebhook(
      payload,
      `t=${now},v1=invalid,v1=${signature(payload, now, secret)}`,
      now,
    );
    expect(result.ok).toBe(true);
  });

  it("rejects signatures outside the five-minute replay window", () => {
    const secret = "whsec_test";
    const issuedAt = 1_800_000_000;
    const payload = JSON.stringify({ id: "evt_old" });
    process.env.STRIPE_WEBHOOK_SECRET = secret;

    expect(
      verifyWebhook(
        payload,
        `t=${issuedAt},v1=${signature(payload, issuedAt, secret)}`,
        issuedAt + 301,
      ),
    ).toEqual({ ok: false, error: "stale signature" });
  });

  it("rejects invalid signatures", () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    expect(verifyWebhook("{}", "t=1800000000,v1=bad", 1_800_000_000)).toEqual({
      ok: false,
      error: "signature mismatch",
    });
  });
});
