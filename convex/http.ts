import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import { z } from "zod";

const callbackSchema = z.object({
  jobId: z.string().min(1),
  workflowId: z.string().min(1),
  eventName: z.string().min(1),
  result: z.object({
    ok: z.boolean(),
    errorMessage: z.string().max(1000).optional(),
    outputs: z.object({
      durationSec: z.number().positive().optional(), width: z.number().positive().optional(), height: z.number().positive().optional(), fps: z.number().positive().optional(),
      proxyUrl: z.string().url().optional(), audioUrl: z.string().url().optional(), proxyObjectKey: z.string().optional(), audioObjectKey: z.string().optional(),
      language: z.string().optional(), fullText: z.string().optional(), engine: z.string().optional(),
      segments: z.array(z.object({ startSec: z.number().nonnegative(), endSec: z.number().positive(), text: z.string(), speaker: z.string().optional() })).optional(),
      words: z.array(z.object({ startSec: z.number().nonnegative(), endSec: z.number().positive(), text: z.string(), confidence: z.number().min(0).max(1).optional() })).optional(),
      clipAssets: z.array(z.object({ clipId: z.string(), previewUrl: z.string().url().optional(), finalUrl: z.string().url().optional(), thumbnailUrl: z.string().url().optional(), previewObjectKey: z.string().optional(), finalObjectKey: z.string().optional(), thumbnailObjectKey: z.string().optional() })).optional(),
      metadata: z.unknown().optional(),
    }).optional(),
  }),
});

const http = httpRouter();
auth.addHttpRoutes(http);

http.route({
  path: "/worker/callback",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const expected = process.env.WORKER_CALLBACK_SECRET;
    const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!expected || provided !== expected) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = callbackSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "Invalid worker callback", issues: parsed.error.issues.map((issue) => issue.message) }, { status: 400 });
    await ctx.runMutation(internal.renderJobs.completeFromWorker, { jobId: parsed.data.jobId, workflowId: parsed.data.workflowId, eventName: parsed.data.eventName, result: parsed.data.result });
    return Response.json({ ok: true });
  }),
});

export default http;
