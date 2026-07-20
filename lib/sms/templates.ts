export function reviewRequestSms(input: {
  business: string;
  customerName: string;
  link: string;
}): string {
  const firstName = input.customerName.trim().split(/\s+/)[0] || "there";
  return `Hi ${firstName}, thanks for visiting ${input.business}. Would you share an honest review? ${input.link} Reply STOP to opt out.`;
}
