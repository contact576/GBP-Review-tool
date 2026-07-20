import { NextResponse } from "next/server";
import { getProviderFor } from "@/lib/data";
import { guardAuthenticatedApi } from "@/lib/security/api";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const guarded = await guardAuthenticatedApi(request, {
    scope: "ai-content-asset",
    roles: ["owner", "manager", "agency_admin", "platform_admin"],
    limit: 120,
    windowMs: 60_000,
  });
  if (!guarded.ok) return guarded.response;
  const { assetId } = await params;
  if (!/^asset_[a-f0-9]{24}$/.test(assetId)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const provider = await getProviderFor(guarded.session);
  const asset = await provider.getAiContentAssetById(guarded.session.workspaceId, assetId);
  if (!asset) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const bytes = Buffer.from(asset.base64Data, "base64");
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "content-type": asset.mimeType,
      "content-length": String(bytes.length),
      "cache-control": "private, max-age=3600",
      "content-security-policy": "default-src 'none'; sandbox",
      "x-content-type-options": "nosniff",
    },
  });
}
