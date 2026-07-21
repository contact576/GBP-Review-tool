import { NextResponse } from "next/server";
import { getPublicProviders } from "@/lib/data";
import { verifySignedContentAsset } from "@/lib/security/content-asset-signature";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const { assetId } = await params;
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspace") || "";
  const expiresAt = Number(url.searchParams.get("expires"));
  const suppliedSignature = url.searchParams.get("signature") || "";
  if (!verifySignedContentAsset({ workspaceId, assetId, expiresAt, suppliedSignature })) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  for (const provider of await getPublicProviders()) {
    const asset = await provider.getAiContentAssetById(workspaceId, assetId);
    if (!asset) continue;
    const bytes = Buffer.from(asset.base64Data, "base64");
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "content-type": asset.mimeType,
        "content-length": String(bytes.length),
        "cache-control": "public, max-age=300",
        "content-security-policy": "default-src 'none'; sandbox",
        "x-content-type-options": "nosniff",
      },
    });
  }
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}
