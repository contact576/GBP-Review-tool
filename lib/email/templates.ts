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
