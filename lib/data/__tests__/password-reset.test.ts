import { describe, expect, it } from "vitest";
import { memoryProvider } from "../memory-provider";

/**
 * These cases run real bcrypt work — one registration plus three hash/verify
 * round trips each — which is deliberately expensive and lands within a second
 * or two of vitest's 5s default. Under the full parallel suite that tipped over
 * into a spurious timeout, so the budget is stated explicitly here. It is a
 * correctness test, not a performance one.
 */
const BCRYPT_TEST_TIMEOUT_MS = 30_000;

describe("password reset token lifecycle", () => {
  it("consumes a valid token once and replaces the password", { timeout: BCRYPT_TEST_TIMEOUT_MS }, async () => {
    const email = `reset-${Date.now()}@example.com`;
    const registered = await memoryProvider.registerUser({
      name: "Reset Owner",
      email,
      password: "OldPass123",
      businessName: "Reset Test Co",
      industryKey: "professional_services",
      region: "US",
    });
    expect(registered.ok).toBe(true);
    if (!registered.ok) return;

    await memoryProvider.savePasswordResetToken({
      tokenHash: "a".repeat(64),
      userId: registered.user.id,
      createdAt: "2026-07-17T00:00:00.000Z",
      expiresAt: "2026-07-17T02:00:00.000Z",
    });

    const { hashPassword } = await import("@/lib/auth/password");
    const changed = await memoryProvider.consumePasswordResetToken(
      "a".repeat(64),
      await hashPassword("NewPass456"),
      "2026-07-17T01:00:00.000Z",
    );
    expect(changed).toBe(true);
    expect(await memoryProvider.verifyCredentials(email, "OldPass123")).toBeNull();
    expect(await memoryProvider.verifyCredentials(email, "NewPass456")).not.toBeNull();
    expect(
      await memoryProvider.consumePasswordResetToken(
        "a".repeat(64),
        await hashPassword("Another789"),
        "2026-07-17T01:10:00.000Z",
      ),
    ).toBe(false);
  });

  it("rejects an expired token", { timeout: BCRYPT_TEST_TIMEOUT_MS }, async () => {
    const email = `expired-${Date.now()}@example.com`;
    const registered = await memoryProvider.registerUser({
      name: "Expired Owner",
      email,
      password: "OldPass123",
      businessName: "Expired Test Co",
      industryKey: "professional_services",
      region: "US",
    });
    expect(registered.ok).toBe(true);
    if (!registered.ok) return;
    await memoryProvider.savePasswordResetToken({
      tokenHash: "b".repeat(64),
      userId: registered.user.id,
      createdAt: "2026-07-17T00:00:00.000Z",
      expiresAt: "2026-07-17T01:00:00.000Z",
    });
    expect(
      await memoryProvider.consumePasswordResetToken(
        "b".repeat(64),
        "unused-hash",
        "2026-07-17T01:00:00.000Z",
      ),
    ).toBe(false);
  });
});
