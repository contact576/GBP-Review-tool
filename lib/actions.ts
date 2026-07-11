"use server";

import { revalidatePath } from "next/cache";
import { getDataProvider } from "@/lib/data";
import { setSession, clearSession, type SessionRole } from "@/lib/auth/session";
import type {
  CaptureCustomerInput,
  SendRequestInput,
  CreateCampaignInput,
  PostReplyInput,
} from "@/lib/data/provider";
import type { CustomerConsent, ReplyTone, Channel } from "@/lib/data/types";

// ── Auth ────────────────────────────────────────────────────
export async function signInAction(role: SessionRole = "owner") {
  await setSession(role);
}
export async function signOutAction() {
  await clearSession();
}

// ── Capture / requests ──────────────────────────────────────
export async function captureCustomerAction(input: CaptureCustomerInput) {
  const provider = await getDataProvider();
  const result = await provider.captureCustomer(input);
  revalidatePath("/app");
  revalidatePath("/app/requests");
  revalidatePath("/app/customers");
  revalidatePath("/staff");
  return { token: result.request.token, customerName: result.customer.name };
}

export async function sendRequestAction(input: SendRequestInput) {
  const provider = await getDataProvider();
  const req = await provider.sendRequest(input);
  revalidatePath("/app/requests");
  revalidatePath("/app/customers");
  return { token: req.token };
}

export async function advanceRequestAction(
  token: string,
  to: "opened" | "clicked" | "posted_google" | "private_feedback",
  meta?: { rating?: 1 | 2 | 3 | 4 | 5; attributes?: string[] },
) {
  const provider = await getDataProvider();
  await provider.advanceRequest(token, to, meta);
  revalidatePath("/app");
  revalidatePath("/app/requests");
}

export async function submitPrivateFeedbackAction(input: {
  token: string;
  rating: 1 | 2 | 3;
  text: string;
}) {
  const provider = await getDataProvider();
  await provider.submitPrivateFeedback(input);
  revalidatePath("/app");
}

// ── Co-Pilot ────────────────────────────────────────────────
export async function approveTaskAction(taskId: string) {
  const provider = await getDataProvider();
  await provider.approveTask(taskId);
  revalidatePath("/app");
  revalidatePath("/app/this-week");
}
export async function snoozeTaskAction(taskId: string) {
  const provider = await getDataProvider();
  await provider.snoozeTask(taskId);
  revalidatePath("/app/this-week");
}

// ── Reviews ─────────────────────────────────────────────────
export async function postReplyAction(input: PostReplyInput & { tone: ReplyTone }) {
  const provider = await getDataProvider();
  await provider.postReply(input);
  revalidatePath("/app/reviews");
  revalidatePath("/app");
}

// ── Campaigns ───────────────────────────────────────────────
export async function createCampaignAction(input: CreateCampaignInput) {
  const provider = await getDataProvider();
  const c = await provider.createCampaign(input);
  revalidatePath("/app/campaigns");
  return { id: c.id, consented: c.audienceConsented, total: c.audienceTotal };
}

// ── Consent ─────────────────────────────────────────────────
export async function updateConsentAction(
  customerId: string,
  consent: Partial<CustomerConsent>,
) {
  const provider = await getDataProvider();
  await provider.updateConsent(customerId, consent);
  revalidatePath("/app/customers");
}

// ── Demo reset ──────────────────────────────────────────────
export async function resetDemoAction() {
  const provider = await getDataProvider();
  await provider.resetDemo();
  revalidatePath("/", "layout");
}

export type { Channel };
