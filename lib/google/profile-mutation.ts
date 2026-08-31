import type {
  AuditFindingTarget,
  GbpAttributeValue,
  GbpLocationRecord,
  GbpProfileSnapshot,
  GbpServiceItem,
  ProfileSuggestion,
} from "@/lib/data/types";
import {
  assertApprovedForExecution,
  type ProfileChangeTarget,
} from "@/lib/compliance/product-policy";
import {
  assertNotNameField,
  assertPayloadWritesNoNameField,
} from "@/lib/compliance/lints";

export type ProfileMutationSurface = "location" | "attributes";

export interface PreparedProfileMutation {
  target: AuditFindingTarget;
  surface: ProfileMutationSurface;
  locationResource: string;
  updateMask: string[];
  beforeValue: unknown;
  proposedValue: unknown;
  requestBody: Record<string, unknown>;
}

/**
 * Writable location fields. The business name (`title`) is deliberately absent:
 * it is never an automated edit target, only a finding a human acts on.
 */
const LOCATION_FIELDS: Partial<Record<AuditFindingTarget, string>> = {
  primary_category: "categories.primaryCategory",
  additional_categories: "categories.additionalCategories",
  address: "storefrontAddress",
  service_area: "serviceArea",
  phone: "phoneNumbers",
  website: "websiteUri",
  description: "profile.description",
  hours: "regularHours",
  special_hours: "specialHours",
  services: "serviceItems",
};

/**
 * Convert one exact, approved suggestion into the smallest possible Google
 * mutation. Broad masks and workflow placeholders are intentionally rejected.
 */
export function prepareProfileMutation(
  suggestion: ProfileSuggestion,
  snapshot: GbpProfileSnapshot,
): PreparedProfileMutation {
  // Google-policy protection first: the business name is never writable here,
  // whatever the approval state of the suggestion.
  assertNotNameField(suggestion.target);
  if (!suggestion.exactPreviewReady || suggestion.proposedValue === undefined) {
    throw new Error("The exact proposed value must be previewed before approval.");
  }
  if (suggestion.status !== "approved") {
    throw new Error("The exact suggestion must be approved before execution.");
  }
  const policyTarget = toPolicyTarget(suggestion.target);
  assertApprovedForExecution({
    target: policyTarget,
    approvedAt: suggestion.approvedAt,
    approvedBy: suggestion.approvedBy,
    factsConfirmed: Boolean(suggestion.factsConfirmedAt && suggestion.factsConfirmedBy),
  });

  if (suggestion.target === "attributes") {
    const attributes = requireAttributes(suggestion.proposedValue);
    return assertPlanWritesNoName({
      target: suggestion.target,
      surface: "attributes",
      locationResource: snapshot.locationResource,
      updateMask: attributes.map((attribute) => attribute.name),
      beforeValue: snapshot.attributes.filter((attribute) =>
        attributes.some((proposed) => proposed.name === attribute.name),
      ),
      proposedValue: attributes,
      requestBody: { attributes },
    });
  }

  const field = LOCATION_FIELDS[suggestion.target];
  if (!field) {
    throw new Error(`Google mutation support is not available for ${suggestion.target}.`);
  }
  const proposedValue = validateLocationValue(suggestion.target, suggestion.proposedValue);
  return assertPlanWritesNoName({
    target: suggestion.target,
    surface: "location",
    locationResource: snapshot.locationResource,
    updateMask: [field],
    beforeValue: valueForTarget(suggestion.target, snapshot.location),
    proposedValue,
    requestBody: requestBodyForTarget(suggestion.target, proposedValue),
  });
}

/**
 * Last gate before a plan can exist: whatever the target claimed to be, the
 * finished mask and body must not touch the Google business name. This is what
 * catches a name change smuggled through another target or a nested field.
 */
function assertPlanWritesNoName(plan: PreparedProfileMutation): PreparedProfileMutation {
  assertNotNameField(plan.target);
  if (plan.surface === "location") {
    for (const maskPath of plan.updateMask) assertNotNameField(maskPath);
  }
  assertPayloadWritesNoNameField(plan.requestBody);
  return plan;
}

export function verifiedValueForPlan(
  plan: PreparedProfileMutation,
  location: GbpLocationRecord,
  attributes: readonly GbpAttributeValue[] = [],
): unknown {
  if (plan.surface === "attributes") {
    const names = new Set(plan.updateMask);
    return attributes.filter((attribute) => names.has(attribute.name));
  }
  return valueForTarget(plan.target, location);
}

export function mutationValuesMatch(expected: unknown, actual: unknown): boolean {
  return stableStringify(expected) === stableStringify(actual);
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
}

function toPolicyTarget(target: AuditFindingTarget): ProfileChangeTarget {
  if (target === "media") return "media_upload";
  if (target === "keyword_coverage" || target === "source_connection") {
    throw new Error(`${target} is a research workflow, not a Google mutation.`);
  }
  return target;
}

function validateLocationValue(target: AuditFindingTarget, value: unknown): unknown {
  if (["website", "description"].includes(target)) {
    if (typeof value !== "string" || !value.trim()) throw new Error(`${target} requires non-empty exact text.`);
    return value.trim();
  }
  if (target === "phone") {
    if (!isRecord(value) || typeof value.primaryPhone !== "string" || !value.primaryPhone.trim()) {
      throw new Error("phone requires an exact primaryPhone value.");
    }
    return value;
  }
  if (target === "primary_category") return requireCategory(value, "primary_category");
  if (target === "additional_categories") {
    if (!Array.isArray(value)) throw new Error("additional_categories requires an exact category list.");
    return value.map((entry) => requireCategory(entry, "additional_categories"));
  }
  if (target === "services") {
    if (!Array.isArray(value)) throw new Error("services requires an exact service list.");
    return value.map(requireService);
  }
  if (["address", "service_area", "hours", "special_hours"].includes(target)) {
    if (!isRecord(value) && !Array.isArray(value)) throw new Error(`${target} requires an exact structured value.`);
    return value;
  }
  return value;
}

function requestBodyForTarget(target: AuditFindingTarget, value: unknown): Record<string, unknown> {
  switch (target) {
    // No `business_title` case on purpose: nothing here may build a name write.
    case "primary_category": return { categories: { primaryCategory: value } };
    case "additional_categories": return { categories: { additionalCategories: value } };
    case "address": return { storefrontAddress: value };
    case "service_area": return { serviceArea: value };
    case "phone": return { phoneNumbers: value };
    case "website": return { websiteUri: value };
    case "description": return { profile: { description: value } };
    case "hours": return { regularHours: value };
    case "special_hours": return { specialHours: value };
    case "services": return { serviceItems: (value as GbpServiceItem[]).map(rawServiceItem) };
    default: throw new Error(`Unsupported location target ${target}.`);
  }
}

function valueForTarget(target: AuditFindingTarget, location: GbpLocationRecord): unknown {
  switch (target) {
    case "business_title": return location.title;
    case "primary_category": return location.categories?.primaryCategory;
    case "additional_categories": return location.categories?.additionalCategories ?? [];
    case "address": return location.storefrontAddress;
    case "service_area": return location.serviceArea;
    case "phone": return location.phoneNumbers;
    case "website": return location.websiteUri;
    case "description": return location.profile?.description;
    case "hours": return location.regularHours;
    case "special_hours": return location.specialHours;
    case "services": return location.serviceItems ?? [];
    default: return undefined;
  }
}

function rawServiceItem(service: GbpServiceItem): Record<string, unknown> {
  const price = service.price ? { price: service.price } : {};
  if (service.source === "structured" && service.serviceTypeId) {
    return {
      structuredServiceItem: {
        serviceTypeId: service.serviceTypeId,
        ...(service.description ? { description: service.description } : {}),
      },
      ...price,
    };
  }
  if (service.source === "free_form" && service.name && service.categoryName) {
    return {
      freeFormServiceItem: {
        category: service.categoryName,
        label: {
          displayName: service.name,
          ...(service.description ? { description: service.description } : {}),
        },
      },
      ...price,
    };
  }
  throw new Error("Every service must be an exact Google structured or free-form service.");
}

function requireCategory(value: unknown, target: string): { name: string; displayName?: string } {
  if (!isRecord(value) || typeof value.name !== "string" || !value.name.trim()) {
    throw new Error(`${target} requires an exact Google category resource name.`);
  }
  return {
    name: value.name.trim(),
    ...(typeof value.displayName === "string" ? { displayName: value.displayName } : {}),
  };
}

function requireService(value: unknown): GbpServiceItem {
  if (!isRecord(value) || !["structured", "free_form"].includes(String(value.source))) {
    throw new Error("Every service requires an exact Google service type.");
  }
  return value as unknown as GbpServiceItem;
}

function requireAttributes(value: unknown): GbpAttributeValue[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("attributes requires at least one exact value.");
  return value.map((entry) => {
    if (!isRecord(entry) || typeof entry.name !== "string" || !entry.name.trim()) {
      throw new Error("Every attribute requires its exact Google attribute name.");
    }
    return entry as unknown as GbpAttributeValue;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
