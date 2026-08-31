/**
 * Builds the AI-Visibility business context out of the workspace's OWN data.
 *
 * Nothing here is invented or vertical-specific: the category comes from the
 * Google profile, the city from the location, and services from the profile's
 * real service list first — falling back to the industry the owner picked, and
 * saying which source was used so the UI can explain the query set.
 */

import { getIndustry } from "@/lib/industries";
import type { FoundlyData } from "@/lib/data/types";
import type { AeoBusinessContext, AeoServicesSource } from "./types";

const MAX_SERVICES = 6;

export type AeoContextSource = Pick<FoundlyData, "location" | "workspace">;

export function buildAeoContext(data: AeoContextSource): AeoBusinessContext {
  const { location, workspace } = data;
  const industry = getIndustry(location.vertical || workspace.vertical);
  const category = firstNonEmpty([
    location.profile.primaryCategory,
    location.category,
    industry.label,
  ]);
  const services = resolveServices(data, industry.services);

  return {
    locationId: location.id,
    businessName: location.name.trim(),
    city: location.city.trim(),
    category,
    services: services.values,
    servicesSource: services.source,
  };
}

function resolveServices(
  data: AeoContextSource,
  industryServices: readonly string[],
): { values: string[]; source: AeoServicesSource } {
  const fromProfile = clean(
    (data.location.gbpSnapshot?.location.serviceItems ?? []).map(
      (item) => item.name ?? item.categoryName ?? "",
    ),
  );
  if (fromProfile.length > 0) return { values: fromProfile, source: "google_profile" };

  const fromSettings = clean(data.workspace.industryConfig?.customServices ?? []);
  if (fromSettings.length > 0) return { values: fromSettings, source: "workspace_settings" };

  const fromCatalog = clean([...industryServices]);
  if (fromCatalog.length > 0) return { values: fromCatalog, source: "industry_catalog" };

  return { values: [], source: "none" };
}

function clean(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim().replace(/\s+/g, " ").slice(0, 60);
    if (value.length < 3) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= MAX_SERVICES) break;
  }
  return out;
}

function firstNonEmpty(values: (string | undefined)[]): string {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

/** Human label for where the service list came from — shown in the UI. */
export const SERVICES_SOURCE_COPY: Record<AeoServicesSource, string> = {
  google_profile: "services listed on your Google profile",
  workspace_settings: "services saved in your workspace settings",
  industry_catalog: "typical services for the industry you selected",
  none: "no service list yet",
};
