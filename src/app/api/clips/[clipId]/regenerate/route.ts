import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchAction } from "convex/nextjs";
import { z } from "zod";
import { api } from "../../../../../../convex/_generated/api";
import { readBoundedJson, RequestBodyError } from "@/server/request";

const bodySchema = z.object({ field: z.enum(["hook", "title", "description"]) });

export async function POST(request: Request, { params }: { params: Promise<{ clipId: string }> }) {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) return Response.json({ error: "AI regeneration is disabled in preview mode." }, { status: 503 });
  const token = await convexAuthNextjsToken();
  if (!token) return Response.json({ error: "Sign in before regenerating metadata." }, { status: 401 });
  let body: unknown;
  try {
    body = await readBoundedJson(request, 8 * 1024);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid request body." }, { status: error instanceof RequestBodyError ? error.status : 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Choose a supported metadata field." }, { status: 400 });
  const { clipId } = await params;
  try {
    return Response.json(await fetchAction(api.aiActions.regenerateMetadata, { clipId, field: parsed.data.field }, { token }));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "AI regeneration failed." }, { status: 502 });
  }
}
