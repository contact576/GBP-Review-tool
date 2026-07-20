import "server-only";
import type { GoogleCredential } from "@/lib/data/provider";
import { decryptSecret } from "./crypto";
import {
  getLocation,
  getLocationAttributes,
  patchLocation,
  patchLocationAttributes,
  refreshAccessToken,
} from "./gbp";
import {
  mutationValuesMatch,
  verifiedValueForPlan,
  type PreparedProfileMutation,
} from "./profile-mutation";

export interface ProfileMutationExecution {
  ok: boolean;
  verified: boolean;
  providerResponse?: unknown;
  verifiedValue?: unknown;
  error?: string;
}

/** Execute one already-approved plan, then independently read Google back. */
export async function executeProfileMutation(
  plan: PreparedProfileMutation,
  credential: GoogleCredential | null,
): Promise<ProfileMutationExecution> {
  if (!credential) return { ok: false, verified: false, error: "Google Business Profile is not connected." };
  const refreshToken = decryptSecret(credential.encryptedRefreshToken);
  if (!refreshToken) return { ok: false, verified: false, error: "Stored Google credential could not be read; reconnect Google." };
  const token = await refreshAccessToken(refreshToken);
  if (!token.ok) return { ok: false, verified: false, error: token.detail };

  if (plan.surface === "attributes") {
    const attributes = plan.requestBody.attributes;
    if (!Array.isArray(attributes)) return { ok: false, verified: false, error: "Invalid prepared attribute payload." };
    const written = await patchLocationAttributes(
      token.data.accessToken,
      plan.locationResource,
      plan.updateMask,
      attributes,
    );
    if (!written.ok) return { ok: false, verified: false, error: written.detail };
    const readBack = await getLocationAttributes(token.data.accessToken, plan.locationResource);
    if (!readBack.ok) {
      return { ok: true, verified: false, providerResponse: written.data, error: readBack.detail };
    }
    const verifiedValue = verifiedValueForPlan(plan, { name: plan.locationResource }, readBack.data);
    return {
      ok: true,
      verified: mutationValuesMatch(plan.proposedValue, verifiedValue),
      providerResponse: written.data,
      verifiedValue,
    };
  }

  const written = await patchLocation(
    token.data.accessToken,
    plan.locationResource,
    plan.updateMask,
    plan.requestBody,
  );
  if (!written.ok) return { ok: false, verified: false, error: written.detail };
  const readBack = await getLocation(token.data.accessToken, plan.locationResource);
  if (!readBack.ok) {
    return { ok: true, verified: false, providerResponse: written.data, error: readBack.detail };
  }
  const verifiedValue = verifiedValueForPlan(plan, readBack.data);
  return {
    ok: true,
    verified: mutationValuesMatch(plan.proposedValue, verifiedValue),
    providerResponse: written.data,
    verifiedValue,
  };
}
