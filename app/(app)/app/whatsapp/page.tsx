import { getData } from "@/lib/data";
import { PageHeader } from "@/components/app/PageHeader";
import { toWhatsAppNumber } from "@/lib/whatsapp/link";
import { canSendService } from "@/lib/compliance/consent";
import { WhatsAppSender, type WhatsAppCandidate } from "./WhatsAppSender";

export default async function WhatsAppPage() {
  const data = await getData();
  const region = data.workspace.region;

  // Resolve eligibility on the server so the phone normalization rules live in
  // one place — the client only renders what it's told.
  const asked = new Set(
    data.requests
      .filter((request) => request.status !== "queued")
      .map((request) => request.customerId),
  );

  const candidates: WhatsAppCandidate[] = data.customers.map((customer) => {
    const number = toWhatsAppNumber(customer.phone, region);
    const blocked = customer.suppressedReason
      ? customer.suppressedReason
      : !canSendService(customer)
        ? "No service-message consent on file"
        : !number
          ? customer.phone
            ? "Phone number isn't dialable on WhatsApp"
            : "No phone number on file"
          : null;
    return {
      id: customer.id,
      name: customer.name,
      phoneDisplay: number?.display ?? customer.phone ?? "",
      blockedReason: blocked,
      alreadyAsked: asked.has(customer.id),
      lastVisitAt: customer.lastVisitAt,
    };
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ask on WhatsApp"
        sub="Pick your customers, write one message, and send it from your own WhatsApp — one chat at a time, no API or Business account needed."
      />

      <WhatsAppSender
        candidates={candidates}
        locationId={data.location.id}
        business={data.location.name}
      />
    </div>
  );
}
