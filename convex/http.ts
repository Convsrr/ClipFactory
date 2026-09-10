import { httpRouter } from "convex/server";
import { z } from "zod";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { constantTimeEqual } from "./lib/secrets";
import { auth } from "./auth";

const workerIdSchema = z.string().min(1).max(120).regex(/^[a-zA-Z0-9._:-]+$/);
const claimSchema = z.object({ workerId: workerIdSchema });
const heartbeatSchema = z.object({
  jobId: z.string().min(1),
  workerId: workerIdSchema,
  attempt: z.number().int().positive(),
  progress: z.number().min(0).max(100).optional(),
});

const cropStrategySchema = z.enum(["face_track", "static_face", "source_center", "scene_aware_center", "safe_center"]);
const captionTimingStrategySchema = z.enum(["word", "segment", "estimated"]);
const sceneIntervalSchema = z.object({
  startSec: z.number().finite().nonnegative(),
  endSec: z.number().finite().positive(),
  durationSec: z.number().finite().positive(),
  representativeSec: z.number().finite().nonnegative(),
}).refine((value) => value.endSec > value.startSec && value.durationSec > 0 && value.representativeSec >= value.startSec && value.representativeSec <= value.endSec);
const cropTrackSchema = z.object({
  clipId: z.string(),
  timebase: z.literal("absolute-video-seconds"),
  coordinateSpace: z.literal("normalized"),
  subjectId: z.string().optional(),
  tracks: z.array(z.object({
    startSec: z.number().finite().nonnegative(),
    endSec: z.number().finite().positive(),
    focusX: z.number().finite().min(0).max(1),
    focusY: z.number().finite().min(0).max(1),
    confidence: z.number().finite().min(0).max(1),
    subjectId: z.string().optional(),
    faceArea: z.number().finite().min(0).max(1).optional(),
  }).refine((value) => value.endSec > value.startSec, { message: "Crop track endSec must be greater than startSec" })),
});
const stageMetadataSchema = z.object({
  cropStrategy: cropStrategySchema.optional(),
  fallbackReason: z.string().max(500).optional(),
  tracker: z.string().max(120).optional(),
  cropTracks: z.array(cropTrackSchema).max(20).optional(),
  sceneTimestamps: z.array(z.number().finite().nonnegative()).max(20_000).optional(),
  sceneIntervals: z.array(sceneIntervalSchema).max(20_001).optional(),
  threshold: z.number().optional(),
  minimumSceneGapSec: z.number().finite().positive().optional(),
  captionObjectKeys: z.array(z.string().max(800)).max(20).optional(),
  captionTiming: z.array(z.object({ clipId: z.string(), timingStrategy: captionTimingStrategySchema, phraseCount: z.number(), wordHighlighting: z.boolean() })).max(20).optional(),
  renderStats: z.array(z.object({
    clipId: z.string(),
    cropStrategy: cropStrategySchema,
    cropKeyframeCount: z.number(),
    captionTimingStrategy: captionTimingStrategySchema.nullable(),
    captionPhraseCount: z.number().nullable(),
    renderDurationMs: z.number(),
    sourceWidth: z.number(),
    sourceHeight: z.number(),
    outputWidth: z.number(),
    outputHeight: z.number(),
  })).max(20).optional(),
});

const callbackSchema = z.object({
  jobId: z.string().min(1),
  workflowId: z.string().min(1),
  workerId: workerIdSchema,
  attempt: z.number().int().positive(),
  result: z.object({
    ok: z.boolean(),
    errorMessage: z.string().max(1000).optional(),
    errorCode: z.string().max(120).optional(),
    retryable: z.boolean().optional(),
    outputs: z.object({
      durationSec: z.number().positive().optional(),
      width: z.number().positive().optional(),
      height: z.number().positive().optional(),
      fps: z.number().positive().optional(),
      proxyUrl: z.string().url().optional(),
      audioUrl: z.string().url().optional(),
      proxyObjectKey: z.string().max(800).optional(),
      audioObjectKey: z.string().max(800).optional(),
      language: z.string().max(80).optional(),
      fullText: z.string().max(2_000_000).optional(),
      engine: z.string().max(120).optional(),
      segments: z.array(z.object({ startSec: z.number().nonnegative(), endSec: z.number().positive(), text: z.string(), speaker: z.string().optional() })).max(100_000).optional(),
      words: z.array(z.object({ startSec: z.number().nonnegative(), endSec: z.number().positive(), text: z.string(), confidence: z.number().min(0).max(1).optional() })).max(500_000).optional(),
      clipAssets: z.array(z.object({
        clipId: z.string(),
        previewUrl: z.string().url().optional(),
        finalUrl: z.string().url().optional(),
        thumbnailUrl: z.string().url().optional(),
        previewObjectKey: z.string().max(800).optional(),
        finalObjectKey: z.string().max(800).optional(),
        thumbnailObjectKey: z.string().max(800).optional(),
      })).max(20).optional(),
      metadata: stageMetadataSchema.optional(),
    }).optional(),
  }),
});

const http = httpRouter();
auth.addHttpRoutes(http);

http.route({
  path: "/worker/claim",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!authorized(request, "WORKER_SHARED_SECRET")) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = claimSchema.safeParse(await safeJson(request));
    if (!parsed.success) return Response.json({ error: "Invalid claim request" }, { status: 400 });
    const claim = await ctx.runMutation(internal.renderJobs.claimNext, { workerId: parsed.data.workerId });
    if (!claim) return Response.json({ job: null });
    try {
      const job = await ctx.runQuery(internal.workerData.payload, { jobId: claim.jobId, workerId: parsed.data.workerId, attempt: claim.attempt });
      return Response.json({ job, leaseExpiresAt: claim.leaseExpiresAt });
    } catch (error) {
      console.error(JSON.stringify({ event: "worker.claim_payload_failed", workerId: parsed.data.workerId, jobId: claim.jobId, attempt: claim.attempt, errorClass: "CLAIM_PAYLOAD_INVALID" }));
      return Response.json({ error: error instanceof Error ? error.message : "Claim payload failed" }, { status: 409 });
    }
  }),
});

http.route({
  path: "/worker/heartbeat",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!authorized(request, "WORKER_SHARED_SECRET")) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = heartbeatSchema.safeParse(await safeJson(request));
    if (!parsed.success) return Response.json({ error: "Invalid heartbeat" }, { status: 400 });
    const result = await ctx.runMutation(internal.renderJobs.heartbeat, {
      jobId: parsed.data.jobId,
      workerId: parsed.data.workerId,
      attempt: parsed.data.attempt,
      progress: parsed.data.progress,
    });
    return Response.json(result, { status: result.accepted ? 200 : 409 });
  }),
});

http.route({
  path: "/worker/callback",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!authorized(request, "WORKER_CALLBACK_SECRET")) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = callbackSchema.safeParse(await safeJson(request));
    if (!parsed.success) return Response.json({ error: "Invalid worker callback", issues: parsed.error.issues.map((issue) => issue.message) }, { status: 400 });
    try {
      const result = await ctx.runMutation(internal.renderJobs.completeFromWorker, parsed.data);
      if (result.disposition === "stale") return Response.json(result, { status: 409 });
      return Response.json(result, { status: result.disposition === "requeued" ? 202 : 200 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("does not exist") || message.includes("does not match")) return Response.json({ error: "Worker callback does not match an active job" }, { status: 409 });
      throw error;
    }
  }),
});

export default http;

function authorized(request: Request, environmentName: "WORKER_SHARED_SECRET" | "WORKER_CALLBACK_SECRET") {
  const expected = process.env[environmentName]?.trim();
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return Boolean(expected && constantTimeEqual(provided, expected));
}

async function safeJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
