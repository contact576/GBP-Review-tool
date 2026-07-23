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
