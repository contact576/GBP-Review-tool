/**
 * Customers worth asking again because the message never got through.
 *
 * The Requests composer only ever offered customers who had *never* been asked,
 * which quietly made a delivery failure permanent: a bounced email or a
 * carrier-rejected SMS removed that customer from the eligible list forever,
 * with no way to try the other channel. This identifies exactly the customers
 * for whom that happened.
 *
 * What is deliberately excluded:
 *
 * - Anyone suppressed. A suppression is a consent decision, not a delivery
 *   problem, and is never worked around by re-asking.
 * - Anyone whose request reached the customer. Nothing here re-asks a person
 *   who already received one, whatever they did with it.
 * - WhatsApp requests. Those are marked failed while they wait for the owner to
 *   press send in their own WhatsApp — nothing was attempted, so there is
 *   nothing to retry. They have their own screen.
 */
import type { Channel, Customer, ReviewRequest } from "@/lib/data/types";

export interface RetryCandidate {
  customer: Customer;
  /** The request that failed. */
  requestId: string;
  /** The channel that failed. */
  failedChannel: Channel;
  /**
   * The channel to try instead — the other one, but only when we actually hold
   * that contact detail. Otherwise the same channel, which may simply have hit
   * a transient failure.
   */
  suggestedChannel: Channel;
}

/** Each customer's most recent request, by send time then creation time. */
export function latestRequestByCustomer(requests: ReviewRequest[]): Map<string, ReviewRequest> {
  const latest = new Map<string, ReviewRequest>();
  for (const request of requests) {
    const current = latest.get(request.customerId);
    if (!current || requestTime(request) > requestTime(current)) latest.set(request.customerId, request);
  }
  return latest;
}

function requestTime(request: ReviewRequest): number {
  const at = new Date(request.sentAt ?? request.createdAt).getTime();
  return Number.isNaN(at) ? 0 : at;
}

function suggestChannel(failed: Channel, customer: Customer): Channel {
  if (failed === "email") return customer.phone ? "sms" : "email";
  if (failed === "sms") return customer.email ? "email" : "sms";
  return failed;
}

export function retryCandidates(
  requests: ReviewRequest[],
  customers: Customer[],
): RetryCandidate[] {
  const latest = latestRequestByCustomer(requests);
  const candidates: RetryCandidate[] = [];
  for (const customer of customers) {
    if (customer.suppressedReason) continue;
    const request = latest.get(customer.id);
    if (!request || request.status !== "failed") continue;
    if (request.channel === "whatsapp") continue;
    candidates.push({
      customer,
      requestId: request.id,
      failedChannel: request.channel,
      suggestedChannel: suggestChannel(request.channel, customer),
    });
  }
  return candidates;
}

/**
 * Index the candidates by customer, for a UI that needs to ask "is this row the
 * one to retry?". Keyed by customer rather than request so a row only offers a
 * retry when it is that customer's most recent attempt — an older failure that
 * was followed by a successful send is history, not a to-do.
 */
export function retryCandidatesByCustomer(
  requests: ReviewRequest[],
  customers: Customer[],
): Map<string, RetryCandidate> {
  const byCustomer = new Map<string, RetryCandidate>();
  for (const candidate of retryCandidates(requests, customers)) {
    byCustomer.set(candidate.customer.id, candidate);
  }
  return byCustomer;
}
