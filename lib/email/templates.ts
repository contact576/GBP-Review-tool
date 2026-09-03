/**
 * Minimal, brand-consistent HTML email templates (inline styles — email
 * clients ignore <style>/CSS files). Pure string builders, no dependencies.
 */

const INK = "#17201D";
const SUB = "#5C6663";
const PAPER = "#F7F6F2";
const PRIMARY = "#0C7A63";
const HAIRLINE = "#E7E5DE";

function wrap(bodyHtml: string, opts?: { brand?: string }): string {
  const brand = opts?.brand ?? "Foundly";
  return `<!doctype html><html><body style="margin:0;background:${PAPER};font-family:Helvetica,Arial,sans-serif;color:${INK}">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px">
    <div style="font-weight:800;font-size:20px;color:${INK};margin-bottom:24px">${brand}</div>
    <div style="background:#fff;border:1px solid ${HAIRLINE};border-radius:16px;padding:28px">
      ${bodyHtml}
    </div>
    <div style="color:${SUB};font-size:12px;margin-top:20px;text-align:center">Reviews powered by ${brand}</div>
  </div></body></html>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:${PRIMARY};color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:12px">${label}</a>`;
}

function h(text: string): string {
  return `<div style="font-size:20px;font-weight:800;margin-bottom:12px">${text}</div>`;
}
function p(text: string): string {
  return `<div style="font-size:15px;color:${SUB};line-height:1.5;margin-bottom:16px">${text}</div>`;
}

export function reviewRequestEmail(input: {
  business: string;
  customerName?: string;
  link: string;
  brand?: string;
}): { subject: string; html: string } {
  const hi = input.customerName ? `Hi ${input.customerName},` : "Hi there,";
  return {
    subject: `How was your experience with ${input.business}?`,
    html: wrap(
      h(`Thanks for choosing ${input.business}`) +
        p(`${hi} would you take 30 seconds to share how it went? It genuinely helps.`) +
        button(input.link, "Leave a review") +
        p(`<br/>If the button doesn't work, copy this link: ${input.link}`),
      { brand: input.brand },
    ),
  };
}

export function staffInviteEmail(input: {
  business: string;
  link: string;
  brand?: string;
}): { subject: string; html: string } {
  return {
    subject: `You're invited to join ${input.business} on Foundly`,
    html: wrap(
      h(`Join the ${input.business} team`) +
        p(`You've been invited to help capture customer reviews. It takes about 10 seconds per customer.`) +
        button(input.link, "Accept invite"),
      { brand: input.brand },
    ),
  };
}

export function passwordResetEmail(input: { link: string; brand?: string }): {
  subject: string;
  html: string;
} {
  return {
    subject: "Reset your Foundly password",
    html: wrap(
      h("Reset your password") +
        p("Click below to choose a new password. This link expires in 1 hour. If you didn't request this, you can ignore it.") +
        button(input.link, "Reset password"),
      { brand: input.brand },
    ),
  };
}

export function verificationEmail(input: { link: string; brand?: string }): {
  subject: string;
  html: string;
} {
  return {
    subject: "Confirm your Foundly email",
    html: wrap(
      h("Confirm your email") +
        p("Confirm this address to activate review sending on your Foundly account. This link expires in 24 hours.") +
        button(input.link, "Confirm email"),
      { brand: input.brand },
    ),
  };
}

/**
 * The Settings → Channels test send. Deliberately plain: its only job is to
 * prove the sender works end-to-end, so what lands in the inbox should look
 * like what a customer will get.
 */
export function emailTestEmail(input?: { brand?: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const brand = input?.brand ?? "Foundly";
  return {
    subject: `${brand} test email — your sender works`,
    html: wrap(
      h("Your email sender is working") +
        p(
          "This is a test from your Foundly Channels settings. If you're reading it, review requests will reach your customers from this address.",
        ) +
        p("Nothing else to do — you can close this."),
      { brand: input?.brand },
    ),
    text: `Your email sender is working.\n\nThis is a test from your ${brand} Channels settings. If you're reading it, review requests will reach your customers from this address.`,
  };
}

export function genericCampaignEmail(input: {
  subject: string;
  body: string;
  unsubscribeUrl?: string;
  brand?: string;
}): { subject: string; html: string } {
  const unsub = input.unsubscribeUrl
    ? `<div style="color:${SUB};font-size:12px;margin-top:16px">Don't want these? <a href="${input.unsubscribeUrl}" style="color:${SUB}">Unsubscribe</a></div>`
    : "";
  return {
    subject: input.subject,
    html: wrap(p(input.body.replace(/\n/g, "<br/>")) + unsub, { brand: input.brand }),
  };
}

/**
 * A marketing campaign message.
 *
 * Differs from `genericCampaignEmail` in two ways that matter legally:
 *  - `unsubscribeUrl` is REQUIRED, not optional. CAN-SPAM §7704(a)(3) and CASL
 *    both require a working opt-out in every commercial message, so the type
 *    system refuses to build one without it.
 *  - the footer names the sender's postal identity and states why the person is
 *    receiving it, which is the other half of the same requirement.
 *
 * The body is escaped: it is owner-authored free text, and unescaped it would
 * let campaign copy inject markup into every recipient's inbox.
 */
export function marketingCampaignEmail(input: {
  subject: string;
  body: string;
  unsubscribeUrl: string;
  business: string;
  /** Postal address shown in the footer, when the workspace has one. */
  postalAddress?: string;
  brand?: string;
  /** Renders an unmistakable test banner and never counts as a campaign send. */
  isTest?: boolean;
}): { subject: string; html: string; text: string } {
  const business = escapeHtml(input.business);
  const banner = input.isTest
    ? `<div style="background:${PAPER};border:1px dashed ${PRIMARY};border-radius:12px;padding:10px 14px;margin-bottom:16px;font-size:12px;font-weight:700;color:${PRIMARY}">TEST SEND — this went only to you. No customer received it.</div>`
    : "";
  const address = input.postalAddress
    ? `<div style="margin-top:4px">${escapeHtml(input.postalAddress)}</div>`
    : "";
  const footer = `<div style="border-top:1px solid ${HAIRLINE};margin-top:20px;padding-top:14px;color:${SUB};font-size:12px;line-height:1.6">
      You are receiving this because you opted in to marketing from ${business}.
      <a href="${input.unsubscribeUrl}" style="color:${SUB};font-weight:700">Unsubscribe</a> at any time.
      ${address}
    </div>`;

  const bodyHtml = escapeHtml(input.body).replace(/\n/g, "<br/>");
  const subject = input.isTest ? `[TEST] ${input.subject}` : input.subject;

  return {
    subject,
    html: wrap(banner + p(bodyHtml) + footer, { brand: input.brand }),
    text: `${input.isTest ? "TEST SEND — this went only to you.\n\n" : ""}${input.body}\n\n—\nYou are receiving this because you opted in to marketing from ${input.business}. Unsubscribe: ${input.unsubscribeUrl}${input.postalAddress ? `\n${input.postalAddress}` : ""}`,
  };
}

/** Plain-text campaign body for SMS, with the required STOP instruction. */
export function marketingCampaignSms(input: { body: string; isTest?: boolean }): string {
  const prefix = input.isTest ? "[TEST] " : "";
  return `${prefix}${input.body.trim()}\nReply STOP to opt out.`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character] ?? character;
  });
}

export function agencyGrowthReportEmail(input: {
  brandName: string;
  primary: string;
  clientName: string;
  city: string;
  growthScore: number;
  rating: number;
  newReviews30d: number;
  needsReply: number;
}): { subject: string; html: string; text: string } {
  const brand = escapeHtml(input.brandName);
  const client = escapeHtml(input.clientName);
  const city = escapeHtml(input.city);
  const primary = /^#[0-9A-Fa-f]{6}$/.test(input.primary) ? input.primary : PRIMARY;
  const metric = (label: string, value: string) =>
    `<td style="width:25%;padding:8px"><div style="border:1px solid ${HAIRLINE};border-radius:12px;padding:14px 10px;text-align:center"><div style="font-size:22px;font-weight:800;color:${INK}">${value}</div><div style="margin-top:4px;font-size:11px;color:${SUB}">${label}</div></div></td>`;
  const followUp = input.needsReply
    ? `${input.needsReply} review${input.needsReply === 1 ? "" : "s"} still need a reply.`
    : "Every detected review has a reply.";
  const body = `
    <div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${primary}">Monthly growth report</div>
    <div style="font-size:24px;font-weight:800;margin:8px 0 4px">${client}</div>
    <div style="font-size:13px;color:${SUB};margin-bottom:20px">${city} · Prepared by ${brand}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
      ${metric("Growth score", String(input.growthScore))}
      ${metric("Rating", input.rating.toFixed(1))}
      ${metric("New reviews", String(input.newReviews30d))}
      ${metric("Needs reply", String(input.needsReply))}
    </tr></table>
    <div style="margin-top:20px;border-left:4px solid ${primary};background:${PAPER};padding:14px 16px;border-radius:0 10px 10px 0;font-size:14px;line-height:1.5;color:${INK}">
      You earned ${input.newReviews30d} new review${input.newReviews30d === 1 ? "" : "s"} in the last 30 days. ${followUp}
    </div>`;
  return {
    subject: `${client}: your monthly local growth report`,
    html: wrap(body, { brand }),
    text: `${client} monthly growth report\nGrowth score: ${input.growthScore}\nRating: ${input.rating.toFixed(1)}\nNew reviews (30d): ${input.newReviews30d}\nNeeds reply: ${input.needsReply}\nPrepared by ${brand}.`,
  };
}

// ── Account lifecycle: welcome + trial notices ──────────────────────────────
//
// Transactional account mail (like verification / password reset): no
// unsubscribe link is required and none is rendered — the person is being told
// about the state of an account they created. Names are owner-typed text and
// are escaped for the same reason the campaign body is.

function accountFooter(): string {
  return `<div style="border-top:1px solid ${HAIRLINE};margin-top:20px;padding-top:14px;color:${SUB};font-size:12px;line-height:1.6">You're receiving this because you have a Foundly account. Nothing here charges a card.</div>`;
}

function numberedSteps(steps: { label: string; href: string }[]): string {
  const items = steps
    .map(
      (step, index) =>
        `<li style="margin:0 0 10px 0;font-size:15px;line-height:1.5"><span style="display:inline-block;min-width:22px;font-weight:800;color:${PRIMARY}">${index + 1}.</span> <a href="${step.href}" style="color:${INK};font-weight:700;text-decoration:underline">${step.label}</a></li>`,
    )
    .join("");
  return `<ol style="list-style:none;padding:0;margin:0 0 20px 0">${items}</ol>`;
}

function bulletList(items: readonly string[]): string {
  return `<ul style="margin:0 0 16px 0;padding-left:18px;color:${SUB};font-size:14px;line-height:1.6">${items
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("")}</ul>`;
}

/**
 * Sent once, right after sign-up. Names the trial length and the three things
 * that make the trial actually show results — the same three steps the
 * dashboard's empty state asks for.
 */
export function welcomeEmail(input: {
  firstName?: string;
  business: string;
  trialDays: number;
  links: { linkBusiness: string; connectGoogle: string; sendRequest: string };
  brand?: string;
}): { subject: string; html: string; text: string } {
  const business = escapeHtml(input.business);
  const hi = input.firstName ? `Hi ${escapeHtml(input.firstName)},` : "Hi there,";
  const steps = [
    { label: `Link ${input.business} to its Google listing`, href: input.links.linkBusiness },
    { label: "Connect your Google Business Profile", href: input.links.connectGoogle },
    { label: "Send your first review request", href: input.links.sendRequest },
  ];
  return {
    subject: `Welcome to Foundly — your ${input.trialDays}-day trial starts now`,
    html: wrap(
      h(`Welcome, ${business} is set up`) +
        p(
          `${hi} every tool is unlocked for the next ${input.trialDays} days — no card, nothing auto-charges. Three steps turn that into real reviews:`,
        ) +
        numberedSteps(steps.map((step) => ({ ...step, label: escapeHtml(step.label) }))) +
        button(input.links.linkBusiness, "Start with step 1") +
        accountFooter(),
      { brand: input.brand },
    ),
    text: `${hi.replace(/,$/, "")}\n\n${input.business} is set up on Foundly. Every tool is unlocked for the next ${input.trialDays} days — no card, nothing auto-charges.\n\nThree steps turn that into real reviews:\n${steps
      .map((step, index) => `${index + 1}. ${step.label}: ${step.href}`)
      .join("\n")}\n\nYou're receiving this because you have a Foundly account.`,
  };
}

/**
 * Sent once, a few days before the trial ends. Says the date, what stays on
 * Free and what pauses, and where to keep the paid plan.
 */
export function trialEndingEmail(input: {
  firstName?: string;
  business: string;
  /** Already formatted for humans, e.g. "Oct 3, 2026". */
  endsOn: string;
  daysLeft: number;
  keeps: readonly string[];
  pauses: readonly string[];
  billingUrl: string;
  brand?: string;
}): { subject: string; html: string; text: string } {
  const hi = input.firstName ? `Hi ${escapeHtml(input.firstName)},` : "Hi there,";
  const when =
    input.daysLeft <= 0
      ? "today"
      : input.daysLeft === 1
        ? "tomorrow"
        : `in ${input.daysLeft} days`;
  return {
    subject: `Your Foundly trial ends ${when} (${input.endsOn})`,
    html: wrap(
      h(`Your trial ends ${when}`) +
        p(
          `${hi} the full-access trial for ${escapeHtml(input.business)} wraps up on <strong style="color:${INK}">${escapeHtml(input.endsOn)}</strong>. Nothing is charged and nothing is deleted — here's what changes.`,
        ) +
        `<div style="font-size:13px;font-weight:800;margin-bottom:6px">You keep, free, forever</div>` +
        bulletList(input.keeps) +
        `<div style="font-size:13px;font-weight:800;margin-bottom:6px">Pauses on Free</div>` +
        bulletList(input.pauses) +
        button(input.billingUrl, "Keep every tool") +
        p(`<br/>Prefer Free? Do nothing — it switches over on ${escapeHtml(input.endsOn)} and your data stays put.`) +
        accountFooter(),
      { brand: input.brand },
    ),
    text: `${hi.replace(/,$/, "")}\n\nThe full-access trial for ${input.business} ends ${when}, on ${input.endsOn}. Nothing is charged and nothing is deleted.\n\nYou keep, free, forever:\n${input.keeps
      .map((item) => `- ${item}`)
      .join("\n")}\n\nPauses on Free:\n${input.pauses
      .map((item) => `- ${item}`)
      .join("\n")}\n\nKeep every tool: ${input.billingUrl}\n\nPrefer Free? Do nothing — it switches over on ${input.endsOn}.`,
  };
}

/**
 * Sent once, on the day the trial expires. The paid tools are now paused; the
 * data is intact; one link puts it all back.
 */
export function trialEndedEmail(input: {
  firstName?: string;
  business: string;
  endedOn: string;
  keeps: readonly string[];
  billingUrl: string;
  brand?: string;
}): { subject: string; html: string; text: string } {
  const hi = input.firstName ? `Hi ${escapeHtml(input.firstName)},` : "Hi there,";
  return {
    subject: `Your Foundly trial has ended — your data is safe`,
    html: wrap(
      h("Your trial has ended") +
        p(
          `${hi} the full-access trial for ${escapeHtml(input.business)} ended on ${escapeHtml(input.endedOn)}. The paid tools are paused; every review, customer, and QR code is exactly where you left it.`,
        ) +
        `<div style="font-size:13px;font-weight:800;margin-bottom:6px">Still yours on Free</div>` +
        bulletList(input.keeps) +
        button(input.billingUrl, "Switch everything back on") +
        p(`<br/>Upgrade any time and the paused tools resume with all their history.`) +
        accountFooter(),
      { brand: input.brand },
    ),
    text: `${hi.replace(/,$/, "")}\n\nThe full-access trial for ${input.business} ended on ${input.endedOn}. The paid tools are paused; every review, customer, and QR code is exactly where you left it.\n\nStill yours on Free:\n${input.keeps
      .map((item) => `- ${item}`)
      .join("\n")}\n\nSwitch everything back on: ${input.billingUrl}`,
  };
}
