import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createReferralCode, parseReferralCode } from "../code";

describe("signed referral codes", () => {
  const previousSecret = process.env.AUTH_SECRET;

  beforeEach(() => {
    process.env.AUTH_SECRET = "test-referral-secret-at-least-32-characters";
  });

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previousSecret;
  });

  it("round trips a valid workspace id", () => {
    const code = createReferralCode("ws_referrer_123");
    expect(parseReferralCode(code)).toBe("ws_referrer_123");
  });

  it("rejects tampering and malformed codes", () => {
    const code = createReferralCode("ws_referrer_123");
    expect(parseReferralCode(`${code}x`)).toBeNull();
    expect(parseReferralCode("../unsafe.signature")).toBeNull();
    expect(parseReferralCode("missing-signature")).toBeNull();
  });
});
