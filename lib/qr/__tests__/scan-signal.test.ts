import { describe, expect, it } from "vitest";
import { classifyQrHit } from "@/lib/qr/scan-signal";

const CHROME_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

function hit(headers: Record<string, string>, method = "GET") {
  return classifyQrHit({ method, headers: new Headers(headers) });
}

describe("scan vs open classification", () => {
  it("counts a real browser navigation as an open", () => {
    expect(
      hit({
        "sec-fetch-mode": "navigate",
        "sec-fetch-dest": "document",
        accept: "text/html,application/xhtml+xml",
        "user-agent": CHROME_UA,
      }),
    ).toBe("browser_navigation");
  });

  it("does not count a subresource or background fetch as an open", () => {
    expect(hit({ "sec-fetch-mode": "cors", "sec-fetch-dest": "empty" })).toBe("background_fetch");
    expect(hit({ "sec-fetch-mode": "no-cors", "sec-fetch-dest": "image" })).toBe("background_fetch");
  });

  it("does not count a prefetch as an open", () => {
    expect(
      hit({ "sec-fetch-mode": "navigate", "sec-fetch-dest": "document", "sec-purpose": "prefetch" }),
    ).toBe("background_fetch");
    expect(hit({ accept: "text/html", "user-agent": CHROME_UA, purpose: "prefetch" })).toBe(
      "background_fetch",
    );
  });

  it("does not count a HEAD probe as an open", () => {
    expect(
      hit({ "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" }, "HEAD"),
    ).toBe("background_fetch");
  });

  it("does not count link unfurlers and crawlers as opens", () => {
    for (const ua of [
      "facebookexternalhit/1.1",
      "Slackbot-LinkExpanding 1.0",
      "WhatsApp/2.23",
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "curl/8.4.0",
      "python-requests/2.31.0",
    ]) {
      expect(hit({ accept: "text/html,*/*", "user-agent": ua })).toBe("background_fetch");
    }
  });

  it("counts a legacy browser with no Fetch Metadata as an open", () => {
    expect(hit({ accept: "text/html,application/xhtml+xml", "user-agent": CHROME_UA })).toBe(
      "browser_navigation",
    );
  });

  it("treats an unidentifiable hit as a scan, never an open", () => {
    expect(hit({})).toBe("background_fetch");
    expect(hit({ accept: "*/*", "user-agent": CHROME_UA })).toBe("background_fetch");
    expect(hit({ accept: "text/html" })).toBe("background_fetch");
  });
});
