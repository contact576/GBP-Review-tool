import { describe, expect, it } from "vitest";
import { trialEndedEmail, trialEndingEmail, welcomeEmail } from "../templates";

const KEEPS = ["Your QR codes & review link", "5 AI drafts a month"];
const PAUSES = ["Campaigns & automations"];

describe("welcomeEmail", () => {
  const email = welcomeEmail({
    firstName: "Priya",
    business: "Harbourview Dental",
    trialDays: 30,
    links: {
      linkBusiness: "https://app.example.com/app/settings/business",
      connectGoogle: "https://app.example.com/app/settings/integrations",
      sendRequest: "https://app.example.com/app/requests",
    },
  });

  it("names the trial length and the three next steps, in order, in both bodies", () => {
    expect(email.subject).toBe("Welcome to Foundly — your 30-day trial starts now");
    expect(email.html).toContain("Hi Priya,");
    expect(email.html).toContain("next 30 days");
    const order = ["settings/business", "settings/integrations", "app/requests"].map((path) =>
      email.html.indexOf(path),
    );
    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(email.text).toContain("1. Link Harbourview Dental to its Google listing: https://app.example.com/app/settings/business");
    expect(email.text).toContain("3. Send your first review request: https://app.example.com/app/requests");
  });

  it("escapes owner-typed names so a business name cannot inject markup", () => {
    const hostile = welcomeEmail({
      firstName: "<img src=x>",
      business: "Bob's <script>alert(1)</script> Bakery",
      trialDays: 30,
      links: { linkBusiness: "https://x/a", connectGoogle: "https://x/b", sendRequest: "https://x/c" },
    });
    expect(hostile.html).not.toContain("<script>");
    expect(hostile.html).not.toContain("<img src=x>");
    expect(hostile.html).toContain("&lt;script&gt;");
    expect(hostile.html).toContain("Bob&#039;s");
  });

  it("falls back to a neutral greeting without a first name", () => {
    const anon = welcomeEmail({
      business: "Harbourview Dental",
      trialDays: 30,
      links: { linkBusiness: "https://x/a", connectGoogle: "https://x/b", sendRequest: "https://x/c" },
    });
    expect(anon.html).toContain("Hi there,");
  });
});

describe("trialEndingEmail", () => {
  it("names the date, what stays and what pauses, and links to billing", () => {
    const email = trialEndingEmail({
      firstName: "Priya",
      business: "Harbourview Dental",
      endsOn: "Sep 6, 2026",
      daysLeft: 3,
      keeps: KEEPS,
      pauses: PAUSES,
      billingUrl: "https://app.example.com/app/settings/billing",
    });
    expect(email.subject).toBe("Your Foundly trial ends in 3 days (Sep 6, 2026)");
    expect(email.html).toContain("Sep 6, 2026");
    for (const item of [...KEEPS, ...PAUSES]) {
      expect(email.html).toContain(item.replace("&", "&amp;"));
      expect(email.text).toContain(item);
    }
    expect(email.html).toContain('href="https://app.example.com/app/settings/billing"');
    expect(email.text).toContain("https://app.example.com/app/settings/billing");
  });

  it("says 'tomorrow' and 'today' at the edges instead of 'in 1 days'", () => {
    const base = { business: "B", endsOn: "Sep 4, 2026", keeps: KEEPS, pauses: PAUSES, billingUrl: "https://x" };
    expect(trialEndingEmail({ ...base, daysLeft: 1 }).subject).toMatch(/ends tomorrow/);
    expect(trialEndingEmail({ ...base, daysLeft: 0 }).subject).toMatch(/ends today/);
  });

  it("carries no unsubscribe link — it is an account notice, not marketing", () => {
    const email = trialEndingEmail({ business: "B", endsOn: "Sep 4, 2026", daysLeft: 2, keeps: KEEPS, pauses: PAUSES, billingUrl: "https://x" });
    expect(email.html.toLowerCase()).not.toContain("unsubscribe");
    expect(email.html).toContain("because you have a Foundly account");
  });
});

describe("trialEndedEmail", () => {
  it("says the data is kept and links to billing to switch tools back on", () => {
    const email = trialEndedEmail({
      firstName: "Priya",
      business: "Harbourview Dental",
      endedOn: "Sep 3, 2026",
      keeps: KEEPS,
      billingUrl: "https://app.example.com/app/settings/billing",
    });
    expect(email.subject).toBe("Your Foundly trial has ended — your data is safe");
    expect(email.html).toContain("ended on Sep 3, 2026");
    expect(email.html).toContain("exactly where you left it");
    expect(email.html).toContain('href="https://app.example.com/app/settings/billing"');
    expect(email.text).toContain("Switch everything back on: https://app.example.com/app/settings/billing");
    for (const item of KEEPS) expect(email.text).toContain(item);
  });
});
