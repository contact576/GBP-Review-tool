/** Body of the Settings → Channels "Send test SMS". Plain, and STOP-compliant like every other text. */
export function testSms(input: { business: string }): string {
  const business = input.business.trim() || "your business";
  return `Foundly test: texts from ${business} are set up and sending. Reply STOP to opt out.`;
}

export function reviewRequestSms(input: {
  business: string;
  customerName: string;
  link: string;
}): string {
  const firstName = input.customerName.trim().split(/\s+/)[0] || "there";
  return `Hi ${firstName}, thanks for visiting ${input.business}. Would you share an honest review? ${input.link} Reply STOP to opt out.`;
}
