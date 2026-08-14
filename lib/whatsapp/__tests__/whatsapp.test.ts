import { describe, expect, it } from "vitest";
import { toWhatsAppNumber, whatsAppChatUrl, whatsAppWebUrl } from "@/lib/whatsapp/link";
import { renderWhatsAppMessage, firstName, WHATSAPP_TEMPLATES } from "@/lib/whatsapp/templates";

describe("toWhatsAppNumber", () => {
  it("keeps an E.164 number's country code", () => {
    expect(toWhatsAppNumber("+1 (415) 555-0123")?.digits).toBe("14155550123");
  });

  it("adds the region dial code to a bare 10-digit NANP number", () => {
    expect(toWhatsAppNumber("415-555-0123", "US")?.digits).toBe("14155550123");
    expect(toWhatsAppNumber("(604) 555 0199", "CA")?.digits).toBe("16045550199");
  });

  it("leaves an 11-digit number that already carries the dial code alone", () => {
    expect(toWhatsAppNumber("1 415 555 0123", "US")?.digits).toBe("14155550123");
  });

  it("accepts non-NANP international numbers in E.164", () => {
    expect(toWhatsAppNumber("+91 98765 43210")?.digits).toBe("919876543210");
    expect(toWhatsAppNumber("+44 20 7946 0958")?.digits).toBe("442079460958");
  });

  it("rejects numbers that can't be dialled rather than opening a dead chat", () => {
    expect(toWhatsAppNumber(undefined)).toBeNull();
    expect(toWhatsAppNumber("")).toBeNull();
    expect(toWhatsAppNumber("ext. 402")).toBeNull();
    expect(toWhatsAppNumber("555-0123")).toBeNull(); // too short even with a dial code
    expect(toWhatsAppNumber("+0123456789")).toBeNull(); // no country code starts with 0
    expect(toWhatsAppNumber("+1234567890123456")).toBeNull(); // past E.164's 15 digits
  });

  it("formats NANP numbers for display", () => {
    expect(toWhatsAppNumber("+14155550123")?.display).toBe("+1 415 555 0123");
    expect(toWhatsAppNumber("+919876543210")?.display).toBe("+919876543210");
  });
});

describe("whatsapp links", () => {
  const message = "Hi Alex, review us? https://foundly.app/r/abc&x=1";

  it("percent-encodes the message so links and punctuation survive", () => {
    const url = whatsAppChatUrl("14155550123", message);
    expect(url.startsWith("https://wa.me/14155550123?text=")).toBe(true);
    expect(url).not.toContain(" ");
    expect(new URL(url).searchParams.get("text")).toBe(message);
  });

  it("builds a WhatsApp Web URL carrying the same message", () => {
    const url = whatsAppWebUrl("14155550123", message);
    const parsed = new URL(url);
    expect(parsed.host).toBe("web.whatsapp.com");
    expect(parsed.searchParams.get("phone")).toBe("14155550123");
    expect(parsed.searchParams.get("text")).toBe(message);
  });
});

describe("renderWhatsAppMessage", () => {
  const values = {
    name: "Alex Morgan",
    business: "Harbourview Dental",
    link: "https://foundly.app/r/abc123",
  };

  it("substitutes every merge tag", () => {
    expect(renderWhatsAppMessage("{{name}} · {{business}} · {{link}}", values)).toBe(
      "Alex · Harbourview Dental · https://foundly.app/r/abc123",
    );
  });

  it("uses the first name only", () => {
    expect(firstName("Alex Morgan")).toBe("Alex");
    expect(firstName("Cher")).toBe("Cher");
  });

  it("tolerates whitespace and casing inside the tags", () => {
    expect(renderWhatsAppMessage("{{ NAME }}", values)).toBe("Alex");
  });

  it("leaves unknown tags untouched instead of blanking them", () => {
    expect(renderWhatsAppMessage("{{unknown}}", values)).toBe("{{unknown}}");
  });

  it("ships templates that all carry a review link", () => {
    for (const template of WHATSAPP_TEMPLATES) {
      expect(template.body).toContain("{{link}}");
      expect(renderWhatsAppMessage(template.body, values)).toContain(values.link);
    }
  });
});
