import { describe, expect, it } from "vitest";
import { isBlockedIp, parseWebsiteHtml } from "@/lib/evidence/website";
import { matchSearchConsoleProperty } from "@/lib/google/search-console";

describe("website evidence extraction", () => {
  it("extracts structured facts, service headings, images, and authorized social links", () => {
    const parsed = parseWebsiteHtml(`
      <html><head>
        <title>Harbourview Physiotherapy | Toronto</title>
        <meta name="description" content="Evidence-based care in Toronto">
        <script type="application/ld+json">{
          "@type":"LocalBusiness",
          "name":"Harbourview Physiotherapy",
          "telephone":"+1 416 555 0100",
          "address":{"streetAddress":"1 Harbour St","addressLocality":"Toronto"},
          "makesOffer":{"name":"Sports Injury Rehabilitation"}
        }</script>
      </head><body>
        <h1>Physiotherapy in Toronto</h1><h2>Sports injury treatment</h2>
        <img src="/team.jpg" alt="Clinical team">
        <a href="/services">Services</a>
        <a href="https://www.instagram.com/harbourviewphysio/">Instagram</a>
      </body></html>
    `, "https://harbourview.example/");
    expect(parsed.page).toMatchObject({ title: "Harbourview Physiotherapy | Toronto", description: "Evidence-based care in Toronto" });
    expect(parsed.page.images[0]).toEqual({ url: "https://harbourview.example/team.jpg", alt: "Clinical team" });
    expect(parsed.facts.businessNames).toContain("Harbourview Physiotherapy");
    expect(parsed.facts.phones).toContain("+14165550100");
    expect(parsed.facts.services).toContain("Sports Injury Rehabilitation");
    expect(parsed.facts.socialProfiles[0]).toContain("instagram.com/harbourviewphysio");
    expect(parsed.sameOriginLinks).toContain("https://harbourview.example/services");
  });

  it("blocks loopback, private, link-local, and metadata-style addresses", () => {
    expect(isBlockedIp("127.0.0.1")).toBe(true);
    expect(isBlockedIp("10.0.0.1")).toBe(true);
    expect(isBlockedIp("169.254.169.254")).toBe(true);
    expect(isBlockedIp("192.168.1.20")).toBe(true);
    expect(isBlockedIp("::1")).toBe(true);
    expect(isBlockedIp("8.8.8.8")).toBe(false);
  });
});

describe("Search Console property matching", () => {
  it("prefers the verified domain property and ignores unverified access", () => {
    expect(matchSearchConsoleProperty("https://www.example.com/services", [
      { siteUrl: "https://www.example.com/", permissionLevel: "siteUnverifiedUser" },
      { siteUrl: "sc-domain:example.com", permissionLevel: "siteOwner" },
    ])).toBe("sc-domain:example.com");
  });
});
