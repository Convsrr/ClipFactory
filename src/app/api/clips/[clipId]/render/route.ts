import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchMutation } from "convex/nextjs";
import { z } from "zod";
import { api } from "../../../../../../convex/_generated/api";
import { readBoundedJson, RequestBodyError } from "@/server/request";

const bodySchema = z.object({
  hook: z.string().min(1).max(180),
  title: z.string().min(1).max(180),
  description: z.string().min(1).max(2_000),
  captionPresetKey: z.enum(["bold-viral", "minimal-clean", "podcast"]),
  renderMode: z.enum(["auto", "fit", "sports", "gameplay"]),
  showHook: z.boolean(),
  showCta: z.boolean(),
  ctaText: z.string().min(1).max(120),
  gameplayObjectKey: z.string().max(800).nullable().optional(),
  audioTrackIndex: z.number().int().min(0).max(15),
});

export async function POST(request: Request, { params }: { params: Promise<{ clipId: string }> }) {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) return Response.json({ error: "Rendering is disabled in preview mode." }, { status: 503 });
  const token = await convexAuthNextjsToken();
  if (!token) return Response.json({ error: "Sign in before rendering." }, { status: 401 });
  let body: unknown;
  try {
    body = await readBoundedJson(request, 16 * 1024);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid request body." }, { status: error instanceof RequestBodyError ? error.status : 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Choose valid clip render settings." }, { status: 400 });
  const { clipId } = await params;
  try {
    return Response.json(await fetchMutation(api.projects.rerenderClip, { clipId, ...parsed.data }, { token }), { status: 202 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not queue the render." }, { status: 409 });
  }
}
