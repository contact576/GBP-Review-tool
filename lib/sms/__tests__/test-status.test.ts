import { afterEach, describe, expect, it } from "vitest";
import { formatSmsTestDetail, maskPhone, parseSmsTestDetail } from "@/lib/sms/test-status";
import { smsEnabled, smsMissingEnvVars, smsSenderDescription } from "@/lib/sms/twilio";
import { testSms } from "@/lib/sms/templates";

const KEYS = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_MESSAGING_SERVICE_SID",
  "TWILIO_FROM_NUMBER",
] as const;
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function setEnv(values: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const key of KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
}

describe("SMS test-result detail round-trips through the twilio integration tile", () => {
  it("masks the recipient to its last four digits", () => {
    expect(maskPhone("+14155550123")).toBe("••••0123");
  });

  it("encodes and decodes an accepted test", () => {
    const detail = formatSmsTestDetail({ ok: true, to: "+14155550123", sid: "SM123abc" });
    expect(detail).not.toContain("+14155550123");
    expect(detail).toContain("check the handset");
    expect(parseSmsTestDetail(detail)).toEqual({ ok: true, to: "••••0123", note: "SM123abc" });
  });

  it("encodes and decodes a failed test, keeping the provider error", () => {
    const detail = formatSmsTestDetail({
      ok: false,
      to: "+14155550123",
      error: "The 'To' number is not a valid phone number.",
    });
    expect(parseSmsTestDetail(detail)).toEqual({
      ok: false,
      to: "••••0123",
      note: "The 'To' number is not a valid phone number.",
    });
  });

  it("returns null for any other tile detail so reconciliation overwrites it", () => {
    expect(parseSmsTestDetail(undefined)).toBeNull();
    expect(parseSmsTestDetail("SMS sender configured — review requests can send by text")).toBeNull();
    expect(parseSmsTestDetail("Test SMS something unexpected")).toBeNull();
  });
});

describe("Twilio env introspection", () => {
  it("names exactly the vars smsEnabled() needs when nothing is set", () => {
    setEnv({});
    expect(smsEnabled()).toBe(false);
    expect(smsMissingEnvVars()).toEqual([
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER",
    ]);
    expect(smsSenderDescription()).toBeNull();
  });

  it("reports only the sender as missing once credentials exist", () => {
    setEnv({ TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "tok" });
    expect(smsEnabled()).toBe(false);
    expect(smsMissingEnvVars()).toEqual(["TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER"]);
  });

  it("describes the sender without leaking the full identifier", () => {
    setEnv({ TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "tok", TWILIO_FROM_NUMBER: "+1 415 555 0123" });
    expect(smsEnabled()).toBe(true);
    expect(smsMissingEnvVars()).toEqual([]);
    expect(smsSenderDescription()).toBe("number ending 0123");

    setEnv({ TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "tok", TWILIO_MESSAGING_SERVICE_SID: "MG0123456789abcdef" });
    expect(smsSenderDescription()).toBe("your Twilio Messaging Service (…cdef)");
    expect(smsSenderDescription()).not.toContain("MG0123456789");
  });

  it("keeps the test text STOP-compliant and names the business", () => {
    const body = testSms({ business: "Harbourview Dental" });
    expect(body).toContain("Harbourview Dental");
    expect(body).toMatch(/Reply STOP/);
    expect(body.length).toBeLessThan(160);
  });
});
