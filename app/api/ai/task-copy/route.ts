import { NextResponse } from "next/server";
import { generateTaskCopy } from "@/lib/ai/generate";
import { boundedString, guardAuthenticatedApi, readJsonObject } from "@/lib/security/api";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const guard = await guardAuthenticatedApi(req, {
    scope: "ai-task-copy",
    roles: ["owner", "manager"],
    limit: 20,
  });
  if (!guard.ok) return guard.response;
  try {
    const body = await readJsonObject(req);
    const result = await generateTaskCopy({
      kind: boundedString(body.kind, 40, "post"),
      business: boundedString(body.business, 120, "the business"),
      context: boundedString(body.context, 2_000),
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
}
