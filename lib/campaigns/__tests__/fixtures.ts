import type { Customer, CustomerConsent, SuppressionEntry } from "@/lib/data/types";

/** Shared customer/consent builders so each test states only what it varies. */

export function consent(overrides: Partial<CustomerConsent> = {}): CustomerConsent {
  return {
    serviceConsent: true,
    serviceConsentAt: "2026-01-01T00:00:00.000Z",
    marketingConsent: true,
    marketingConsentAt: "2026-01-01T00:00:00.000Z",
    consentChannel: "in_person",
    consentSourceText: "Customer agreed in person.",
    caslCaptured: true,
    ...overrides,
  };
}

export function customer(overrides: Partial<Customer> & { id: string }): Customer {
  return {
    locationId: "loc_1",
    name: "Sam Rivera",
    email: `${overrides.id}@example.com`,
    phone: "+14155550123",
    createdAt: "2026-01-01T00:00:00.000Z",
    source: "staff",
    visitCount: 1,
    services: ["Assessment"],
    lifecycleStage: "new",
    consent: consent(),
    tags: [],
    ...overrides,
  };
}

export function suppressionEntry(
  overrides: Partial<SuppressionEntry> & { matchType: SuppressionEntry["matchType"]; value: string },
): SuppressionEntry {
  return {
    id: `sup_${overrides.value}`,
    locationId: "loc_1",
    reason: "Replied STOP",
    addedAt: "2026-02-01T00:00:00.000Z",
    ...overrides,
  };
}
