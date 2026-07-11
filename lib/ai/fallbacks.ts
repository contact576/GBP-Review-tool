import type { DraftVariant } from "@/lib/data/types";

/**
 * Deterministic template generators — used when no ANTHROPIC_API_KEY is set.
 * Output is guaranteed lint-clean and slot-filled from real inputs only.
 */

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length]!;
}

export interface ReviewDraftInput {
  business: string;
  category: string;
  rating: number;
  attributes: string[];
  staffName?: string;
  service?: string;
}

export function fallbackReviewDrafts(input: ReviewDraftInput): DraftVariant[] {
  const attr = input.attributes[0] ?? "the care";
  const attr2 = input.attributes[1] ?? "the whole experience";
  const staff = input.staffName ? ` ${input.staffName}` : " the team";
  const svc = input.service ? ` for ${input.service.toLowerCase()}` : "";

  const warm = `I had a great experience at ${input.business}${svc}. What stood out was ${attr.toLowerCase()} — ${staff.trim()} made me feel looked after the whole way through. Would happily recommend them.`;
  const punchy = `Really pleased with ${input.business}. ${cap(attr)} and ${attr2.toLowerCase()} were exactly what I hoped for. Highly recommend.`;
  const detailed = `From the first appointment${svc}, ${input.business} was professional and genuinely helpful.${staff ? staff + " took the time to explain things" : " The team took the time to explain things"} and ${attr.toLowerCase()} made all the difference. I left feeling in good hands and would come back without hesitation.`;

  return [
    { text: warm, tone: "Warm" },
    { text: punchy, tone: "Short & punchy" },
    { text: detailed, tone: "Detailed" },
  ];
}

export interface ReplyDraftInput {
  reviewText: string;
  rating: number;
  business: string;
  author?: string;
}

export function fallbackReplyDrafts(input: ReplyDraftInput): DraftVariant[] {
  const name = input.author ? `, ${input.author.split(" ")[0]}` : "";
  if (input.rating >= 4) {
    return [
      { text: `Thank you so much${name}! We're thrilled you had a great experience with us — it genuinely makes our day. We look forward to seeing you again.`, tone: "warm" },
      { text: `We really appreciate you taking the time to share this${name}. Thank you for trusting ${input.business} — see you next time.`, tone: "professional" },
      { text: `Thanks${name} — this means a lot to the whole team!`, tone: "brief" },
    ];
  }
  return [
    { text: `Thank you for the honest feedback${name}. We're sorry your experience fell short of what we aim for. We'd genuinely like to make it right — please reach out to us directly so we can look into it.`, tone: "warm" },
    { text: `We appreciate you letting us know${name}. This isn't the standard we hold ourselves to, and we'd like the chance to understand what happened. Please contact us directly and we'll follow up.`, tone: "professional" },
    { text: `Thank you for the feedback${name}. We'd like to make this right — please reach out so we can help.`, tone: "brief" },
  ];
}

export function fallbackCampaignCopy(input: {
  type: string;
  business: string;
  goal: string;
  channel: string;
}): { subject: string; body: string } {
  const merge = "{first_name}";
  if (input.type === "winback") {
    return {
      subject: `We miss you at ${input.business}`,
      body: `Hi ${merge}, it's been a while since your last visit to ${input.business}. We'd love to see you again — book a time that works for you and we'll take great care of you.`,
    };
  }
  if (input.type === "reminder") {
    return {
      subject: `A quick reminder from ${input.business}`,
      body: `Hi ${merge}, this is a friendly reminder from ${input.business}. ${input.goal || "Let us know if we can help you book your next visit."}`,
    };
  }
  return {
    subject: `${input.goal || "A note"} from ${input.business}`,
    body: `Hi ${merge}, ${input.goal || "we have something to share with you"}. Reply anytime or book online — we'd love to see you.`,
  };
}

export function fallbackTaskCopy(input: {
  kind: string;
  business: string;
  context: string;
}): string {
  if (input.kind === "qna") {
    return input.context || `Q: What services do you offer? A: We offer a full range of care at ${input.business} — reach out and we'll point you to the right option.`;
  }
  return input.context || `An update from ${input.business}: we're here and ready to help. Book online or give us a call — we'd love to see you this week.`;
}

export function fallbackReportNarration(input: {
  business: string;
  foundYou: number;
  foundDelta: number;
  contactedYou: number;
  newReviews: number;
}): string {
  const trend = input.foundDelta >= 0 ? `up ${input.foundDelta}%` : `down ${Math.abs(input.foundDelta)}%`;
  return `This month, ${input.foundYou.toLocaleString()} people found ${input.business} on Google — ${trend} from the month before. ${input.contactedYou} people took an action to contact you, and ${input.newReviews} new reviews were detected. Your steady stream of fresh reviews is a big part of why more people are finding you. Keep the momentum going with this week's three tasks.`;
}

export function fallbackFeedbackSummary(items: string[]): { theme: string; action: string } {
  const joined = items.join(" ").toLowerCase();
  let theme = "General service feedback";
  let action = "Review each note and follow up personally where a contact was left.";
  if (joined.includes("wait") || joined.includes("rushed")) {
    theme = "Wait times and appointment pacing";
    action = "Consider buffer time between appointments and set clearer expectations at check-in.";
  } else if (joined.includes("park")) {
    theme = "Parking and wayfinding";
    action = "Add clear parking directions to your confirmation messages and a sign near the entrance.";
  } else if (joined.includes("price") || joined.includes("billing")) {
    theme = "Pricing and billing clarity";
    action = "Make billing and direct-billing details clearer up front to avoid surprises.";
  }
  return { theme, action };
}

export function fallbackScoreSample(input: { business: string; category: string }): string {
  const samples = [
    `Fantastic experience at ${input.business}. The team was friendly, professional, and genuinely helpful — I left feeling well looked after. Highly recommend.`,
    `Couldn't be happier with ${input.business}. Easy to book, on time, and they really listened. Will definitely be back.`,
    `${input.business} exceeded my expectations. Clean, welcoming, and the results speak for themselves. Five stars.`,
  ];
  return pick(samples, input.business.length + input.category.length);
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
