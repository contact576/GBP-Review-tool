import type { Customer, CustomerConsent, Region } from "@/lib/data/types";
import { MICROCOPY } from "./microcopy";

/**
 * Dual-consent guards. Service consent and marketing consent are two separate
 * legal objects — neither implies the other in any query.
 */

export function canSendService(customer: Customer): boolean {
  return customer.consent.serviceConsent && !customer.consent.withdrawnAt;
}

export function canSendMarketing(customer: Customer): boolean {
  return customer.consent.marketingConsent && !customer.consent.withdrawnAt;
}

/** Split an audience for a given send purpose and report exclusions. */
export function filterAudience(
  customers: Customer[],
  basis: "service" | "marketing",
): { eligible: Customer[]; excluded: { reason: string; count: number }[] } {
  const check = basis === "marketing" ? canSendMarketing : canSendService;
  const eligible = customers.filter(check);
  const noConsent = customers.filter((c) => !check(c) && !c.suppressedReason).length;
  const suppressed = customers.filter((c) => c.suppressedReason).length;
  const noChannel = customers.filter((c) => !c.email && !c.phone).length;
  const excluded = [
    {
      reason: basis === "marketing" ? "Not opted in to marketing" : "No service consent",
      count: noConsent,
    },
    { reason: "Suppressed", count: suppressed },
    { reason: "No valid channel", count: noChannel },
  ].filter((e) => e.count > 0);
  return { eligible, excluded };
}

export function consentLabels(region: Region): {
  service: string;
  marketing: string;
  casl?: string;
} {
  return {
    service: MICROCOPY.consentServiceLabel,
    marketing: MICROCOPY.consentMarketingLabel,
    casl: region === "CA" ? MICROCOPY.caslNote : undefined,
  };
}

export function makeConsentSourceText(region: Region, marketing: boolean): string {
  const base = "Customer agreed to receive service messages about their visit";
  const mk = marketing ? " and occasional marketing offers" : "";
  const casl = region === "CA" ? " (CASL express consent, captured in person)" : "";
  return `${base}${mk}${casl}.`;
}

export type { CustomerConsent };
