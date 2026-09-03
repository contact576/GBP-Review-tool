/**
 * Trial notice cron: "your trial ends in 3 days" and "your trial has ended".
 *
 * Runs after the daily monitoring batch (app/api/cron/monitor). Each notice
 * is sent once per workspace — `subscription.trialNotices` records the send,
 * so a re-run, a retried cron, or an overlapping invocation cannot double
 * send. Failures are reported in the result and never thrown at the cron.
 *
 * The window logic is pure (`trialNoticeDue`) and unit-tested on its own; the
 * runner around it only does I/O.
 */

import type { DataProvider } from "@/lib/data/provider";
import type { Subscription, TrialNotices } from "@/lib/data/types";
import type { SendEmailInput, SendEmailResult } from "@/lib/email";
import { trialEndedEmail, trialEndingEmail } from "@/lib/email/templates";
import { formatDate } from "@/lib/utils/format";
import { TRIAL_FREE_KEEPS, TRIAL_PAUSES_ON_FREE, trialState } from "./trial";

export type TrialNoticeKind = keyof TrialNotices;

/**
 * An "ended" notice is only worth sending close to the event. Trials that
 * expired long before this cron existed get the in-app lock, not a stale
 * email about a date months ago.
 */
export const TRIAL_ENDED_NOTICE_WINDOW_DAYS = 7;

/**
 * Which notice, if any, this subscription is due right now.
 *
 *  - "ending": live trial with ≤ TRIAL_ENDING_SOON_DAYS left, not yet sent.
 *  - "ended":  expired within the last TRIAL_ENDED_NOTICE_WINDOW_DAYS, not yet sent.
 *
 * An expired trial never gets the "ending" notice — the later state wins.
 */
export function trialNoticeDue(
  subscription: Pick<Subscription, "status" | "trialEndsAt" | "trialNotices">,
  now: Date,
): TrialNoticeKind | null {
  const state = trialState(subscription, now);
  if (state.phase === "expired") {
    if (subscription.trialNotices?.ended) return null;
    return state.daysSinceEnd <= TRIAL_ENDED_NOTICE_WINDOW_DAYS ? "ended" : null;
  }
  if (state.phase === "ending_soon") {
    return subscription.trialNotices?.ending ? null : "ending";
  }
  return null;
}

export interface TrialEmailBatchResult {
  /** Trialing subscriptions examined. */
  checked: number;
  /** How many were inside a send window and not yet notified. */
  due: number;
  sent: { ending: number; ended: number };
  /** Due but not sendable — demo workspace, no owner email, or email not configured. */
  skipped: number;
  failed: number;
  errors: string[];
}

export type TrialEmailSender = (input: SendEmailInput) => Promise<SendEmailResult>;

export async function runTrialEmailBatch(input: {
  provider: DataProvider;
  now?: Date;
  /** Absolute app origin for the billing link. Defaults to `appUrl()`. */
  baseUrl?: string;
  /** Injectable for tests; defaults to `sendEmail` from lib/email. */
  send?: TrialEmailSender;
}): Promise<TrialEmailBatchResult> {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const result: TrialEmailBatchResult = {
    checked: 0,
    due: 0,
    sent: { ending: 0, ended: 0 },
    skipped: 0,
    failed: 0,
    errors: [],
  };

  const subscriptions = await input.provider.listTrialingSubscriptions();
  result.checked = subscriptions.length;
  const due = subscriptions
    .map((subscription) => ({ subscription, kind: trialNoticeDue(subscription, now) }))
    .filter((item): item is { subscription: Subscription; kind: TrialNoticeKind } => item.kind !== null);
  result.due = due.length;
  if (!due.length) return result;

  // Resolved lazily so the pure window logic above never drags the email
  // adapter (and its `server-only` marker) into a unit test.
  const send = input.send ?? (await import("@/lib/email")).sendEmail;
  const baseUrl = input.baseUrl ?? (await (await import("@/lib/utils/app-url")).appUrl());
  const billingUrl = `${baseUrl}/app/settings/billing`;

  for (const { subscription, kind } of due) {
    const workspaceId = subscription.workspaceId;
    try {
      const data = await input.provider.getData(workspaceId);
      const to = data?.owner.email?.trim();
      if (!data || data.workspace.isDemo || !to) {
        result.skipped += 1;
        continue;
      }
      const state = trialState(subscription, now);
      const endsAt = state.endsAt ?? nowIso;
      const firstName = data.owner.name.split(" ")[0] || undefined;
      const template =
        kind === "ending"
          ? trialEndingEmail({
              firstName,
              business: data.location.name,
              endsOn: formatDate(endsAt),
              daysLeft: state.daysLeft,
              keeps: TRIAL_FREE_KEEPS,
              pauses: TRIAL_PAUSES_ON_FREE,
              billingUrl,
            })
          : trialEndedEmail({
              firstName,
              business: data.location.name,
              endedOn: formatDate(endsAt),
              keeps: TRIAL_FREE_KEEPS,
              billingUrl,
            });
      const sent = await send({
        to,
        subject: template.subject,
        html: template.html,
        text: template.text,
        workspaceId,
      });
      if (!sent.ok) {
        if (sent.reason === "not_configured") {
          result.skipped += 1;
        } else {
          result.failed += 1;
          result.errors.push(`${workspaceId}: ${sent.detail ?? "send failed"}`.slice(0, 200));
        }
        continue;
      }
      await input.provider.markTrialNoticeSent(workspaceId, kind, nowIso);
      result.sent[kind] += 1;
    } catch (error) {
      result.failed += 1;
      const message = error instanceof Error ? error.message : "unexpected error";
      result.errors.push(`${workspaceId}: ${message}`.slice(0, 200));
    }
  }
  return result;
}
