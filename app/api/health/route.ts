import { NextResponse } from "next/server";
import { hasAiKey } from "@/lib/ai/model";
import { isDbBacked } from "@/lib/data";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "foundly",
    aiKeyed: hasAiKey(),
    dbBacked: isDbBacked(),
    time: new Date().toISOString(),
  });
}
