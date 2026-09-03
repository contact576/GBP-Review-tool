import "server-only";
import type { DataProvider } from "@/lib/data/provider";

/**
 * Tell the owner when a review request was accepted for sending and then failed
 * on its way to the customer.
 *
 * The synchronous send path already reports its outcome to whoever pressed
 * send. This covers the case nobody is watching: Twilio accepts a message, the
 * carrier later rejects it, and the status webhook quietly flips the request to
 * failed. Until now the owner's only clue was a status column they had no
 * reason to re-open — they believed the request had gone out.
 *
 * One notification per workspace per UTC day. The id is deterministic, and both
 * providers ignore an insert whose id already exists, so a batch that fails at
 * the carrier posts one alert instead of one per message. The wording therefore
 * never claims a count — it points at Requests, where every delivery state is
 * listed.
 */
export async function notifyDeliveryFailure(input: {
  provider: DataProvider;
  workspaceId: string;
  /** When the failure was observed. */
  at: Date;
  /** Carrier/provider detail, already trimmed by the caller. */
  detail?: string;
}): Promise<boolean> {
  const { provider, workspaceId, at, detail } = input;
  if (Number.isNaN(at.getTime())) return false;
  const data = await provider.getData(workspaceId);
  if (!data) return false;
  const day = at.toISOString().slice(0, 10);
  try {
    await provider.appendNotification(workspaceId, {
      id: `ntf_delivery_failed_${day}`,
      locationId: data.location.id,
      kind: "delivery",
      title: "A review request didn't reach the customer",
      body: `${
        detail ? `${detail} ` : ""
      }The message was accepted for sending and then failed on delivery. Open Requests to see which ones, and to try another channel.`,
      createdAt: at.toISOString(),
      read: false,
    });
    return true;
  } catch {
    // Never let an alert break the webhook that recorded the real outcome.
    return false;
  }
}
