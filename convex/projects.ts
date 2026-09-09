import { start, type WorkflowId } from "@convex-dev/workflow";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import { presentClip, presentProjectSummary } from "./lib/presenters";
import { clipSummaryValidator, projectSummaryValidator, timelineItemValidator } from "./lib/validators";
import { PRODUCT_LIMITS, PROCESSING_STAGES, progressAfterStage, resumeStageForHistory, stageIndex, type ProcessingStage } from "../shared/reliability";
import { rateLimit } from "./lib/rateLimits";
import { stageNameValidator } from "./lib/stages";

const stages = ["ingest", "transcribe", "analyse", "scene_detect", "face_track", "caption_render", "clip_render", "thumbnail_render"] as const;
const supportedUploadTypes = new Set(["video/mp4", "video/quicktime", "video/webm"]);

export const list = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(projectSummaryValidator),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const limit = Math.max(1, Math.min(args.limit ?? 30, 50));
    const projects = await ctx.db.query("projects").withIndex("by_userId_and_createdAt", (q) => q.eq("userId", userId)).order("desc").take(limit);
    return Promise.all(projects.map((project) => presentProjectSummary(ctx, project)));
  },
});

export const detail = query({
  args: { projectId: v.string() },
  returns: v.union(
    v.object({
      id: v.string(),
      title: v.string(),
      sourceType: v.union(v.literal("upload"), v.literal("youtube"), v.literal("google_drive")),
      status: v.union(v.literal("draft"), v.literal("processing"), v.literal("complete"), v.literal("failed")),
      createdAt: v.number(),
      updatedAt: v.number(),
      clipCount: v.number(),
      durationSec: v.union(v.number(), v.null()),
      progress: v.number(),
      activeStage: v.union(
        v.literal("ingest"), v.literal("transcribe"), v.literal("analyse"), v.literal("scene_detect"),
        v.literal("face_track"), v.literal("caption_render"), v.literal("clip_render"), v.literal("thumbnail_render"), v.null(),
      ),
      sourceFilename: v.union(v.string(), v.null()),
      sourceUrl: v.union(v.string(), v.null()),
      transcriptStatus: v.union(v.literal("queued"), v.literal("running"), v.literal("complete"), v.literal("failed")),
      transcriptLanguage: v.union(v.string(), v.null()),
      transcriptText: v.union(v.string(), v.null()),
      clips: v.array(clipSummaryValidator),
      timeline: v.array(timelineItemValidator),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const projectId = ctx.db.normalizeId("projects", args.projectId);
    if (!projectId) return null;
    const userId = await requireUserId(ctx);
    const project = await ctx.db.get(projectId);
    if (!project || project.userId !== userId) return null;

    const [videos, transcripts, clips, jobs] = await Promise.all([
      ctx.db.query("videos").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).take(1),
      ctx.db.query("transcripts").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).order("desc").take(1),
      ctx.db.query("clips").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).order("desc").take(20),
      ctx.db.query("renderJobs").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).order("desc").take(64),
    ]);
    const video = videos[0];
    const transcript = transcripts[0];
    const latestByStage = new Map<string, (typeof jobs)[number]>();
    for (const job of jobs) if (!latestByStage.has(job.type)) latestByStage.set(job.type, job);
    const timeline = stages.map((stage) => {
      const job = latestByStage.get(stage);
      return { stage, status: job?.status ?? "queued" as const, progress: job?.progress ?? 0 };
    });
    return {
      id: project._id as string,
      title: project.title,
      sourceType: project.sourceType,
      status: project.status,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      clipCount: clips.length,
      durationSec: video?.durationSec ?? null,
      progress: project.progress,
      activeStage: project.status === "processing" ? project.activeStage ?? null : null,
      sourceFilename: video?.sourceFilename ?? null,
      sourceUrl: video?.originalUrl ?? null,
      transcriptStatus: transcript?.status ?? "queued",
      transcriptLanguage: transcript?.language ?? null,
      transcriptText: transcript?.fullText ?? null,
      clips: clips.map(presentClip),
      timeline,
    };
  },
});

export const createFromUpload = mutation({
  args: {
    title: v.string(),
    objectKey: v.string(),
    sourceFilename: v.string(),
    mimeType: v.string(),
    fileSizeBytes: v.number(),
    originalUrl: v.optional(v.string()),
  },
  returns: v.object({ projectId: v.string(), videoId: v.string() }),
  handler: async (ctx, args): Promise<{ projectId: string; videoId: string }> => {
    const userId = await requireUserId(ctx);
    await rateLimit(ctx, { name: "projectCreation", key: userId, throws: true });
    await enforceProjectCapacity(ctx, userId);
    const user = await ctx.db.get(userId);
    if (!user || user.creditsRemaining <= 0) throw new Error("No processing credits remain");
    assertOwnedSourceKey(userId, args.objectKey);
    validateUploadMetadata(args.fileSizeBytes, args.mimeType);
    const intent = await ctx.db.query("uploadIntents").withIndex("by_objectKey", (q) => q.eq("objectKey", args.objectKey)).first();
    if (!intent || intent.userId !== userId || intent.status !== "pending" || intent.expiresAt <= Date.now()) throw new Error("Upload target is missing or expired");
    const sourceFilename = cleanFilename(args.sourceFilename);
    if (intent.fileSizeBytes !== args.fileSizeBytes || intent.mimeType !== args.mimeType || intent.sourceFilename !== sourceFilename) throw new Error("Upload metadata does not match the signed target");
    const title = cleanTitle(args.title);
    const now = Date.now();
    const projectId = await ctx.db.insert("projects", { userId, title, sourceType: "upload", status: "processing", activeStage: "ingest", progress: 1, createdAt: now, updatedAt: now });
    const videoId = await ctx.db.insert("videos", { projectId, userId, originalUrl: args.originalUrl, originalObjectKey: args.objectKey, sourceFilename, mimeType: args.mimeType, fileSizeBytes: args.fileSizeBytes, uploadStatus: "uploaded", createdAt: now, updatedAt: now });
    await ctx.db.patch(intent._id, { status: "attached", projectId, updatedAt: now });
    await beginWorkflow(ctx, projectId, videoId);
    return { projectId: projectId as string, videoId: videoId as string };
  },
});

export const createFromYoutube = mutation({
  args: { title: v.string(), youtubeUrl: v.string() },
  returns: v.object({ projectId: v.string(), videoId: v.string() }),
  handler: async (ctx, args): Promise<{ projectId: string; videoId: string }> => {
    const userId = await requireUserId(ctx);
    await rateLimit(ctx, { name: "projectCreation", key: userId, throws: true });
    await enforceProjectCapacity(ctx, userId);
    const user = await ctx.db.get(userId);
    if (!user || user.creditsRemaining <= 0) throw new Error("No processing credits remain");
    const url = validatedYoutubeUrl(args.youtubeUrl);
    const now = Date.now();
    const projectId = await ctx.db.insert("projects", { userId, title: cleanTitle(args.title), sourceType: "youtube", status: "processing", activeStage: "ingest", progress: 1, createdAt: now, updatedAt: now });
    const videoId = await ctx.db.insert("videos", { projectId, userId, originalUrl: url.toString(), uploadStatus: "uploaded", createdAt: now, updatedAt: now });
    await beginWorkflow(ctx, projectId, videoId);
    return { projectId: projectId as string, videoId: videoId as string };
  },
});

export const createFromGoogleDrive = mutation({
  args: { title: v.string(), googleDriveUrl: v.string() },
  returns: v.object({ projectId: v.string(), videoId: v.string() }),
  handler: async (ctx, args): Promise<{ projectId: string; videoId: string }> => {
    const userId = await requireUserId(ctx);
    await rateLimit(ctx, { name: "projectCreation", key: userId, throws: true });
    await enforceProjectCapacity(ctx, userId);
    const user = await ctx.db.get(userId);
    if (!user || user.creditsRemaining <= 0) throw new Error("No processing credits remain");
    const url = validatedGoogleDriveUrl(args.googleDriveUrl);
    const now = Date.now();
    const projectId = await ctx.db.insert("projects", { userId, title: cleanTitle(args.title), sourceType: "google_drive", status: "processing", activeStage: "ingest", progress: 1, createdAt: now, updatedAt: now });
    const videoId = await ctx.db.insert("videos", { projectId, userId, originalUrl: url, uploadStatus: "uploaded", createdAt: now, updatedAt: now });
    await beginWorkflow(ctx, projectId, videoId);
    return { projectId: projectId as string, videoId: videoId as string };
  },
});

export const createUploadIntent = mutation({
  args: {
    objectKey: v.string(),
    sourceFilename: v.string(),
    mimeType: v.string(),
    fileSizeBytes: v.number(),
  },
  returns: v.object({ expiresAt: v.number() }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await rateLimit(ctx, { name: "uploadSigning", key: userId, throws: true });
    assertOwnedSourceKey(userId, args.objectKey);
    validateUploadMetadata(args.fileSizeBytes, args.mimeType);
    const existing = await ctx.db.query("uploadIntents").withIndex("by_objectKey", (q) => q.eq("objectKey", args.objectKey)).first();
    if (existing) throw new Error("Upload target already exists");
    const now = Date.now();
    const expiresAt = now + PRODUCT_LIMITS.uploadIntentTtlMs;
    await ctx.db.insert("uploadIntents", {
      userId,
      objectKey: args.objectKey,
      sourceFilename: cleanFilename(args.sourceFilename),
      mimeType: args.mimeType,
      fileSizeBytes: args.fileSizeBytes,
      status: "pending",
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });
    return { expiresAt };
  },
});

export const retryFailedProject = mutation({
  args: { projectId: v.string() },
  returns: v.object({ workflowId: v.string(), startStage: stageNameValidator }),
  handler: async (ctx, args): Promise<{ workflowId: string; startStage: ProcessingStage }> => {
    const userId = await requireUserId(ctx);
    await rateLimit(ctx, { name: "projectRetry", key: userId, throws: true });
    const projectId = ctx.db.normalizeId("projects", args.projectId);
    if (!projectId) throw new Error("Project not found");
    const project = await ctx.db.get(projectId);
    if (!project || project.userId !== userId) throw new Error("Project not found");
    if (project.status !== "failed") throw new Error("Only a failed project can be retried");
    const [videos, jobs] = await Promise.all([
      ctx.db.query("videos").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).take(1),
      ctx.db.query("renderJobs").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).order("desc").take(64),
    ]);
    const video = videos[0];
    if (!video) throw new Error("Project source video is missing");
    if (jobs.some((job) => job.status === "queued" || job.status === "running")) throw new Error("Project already has recoverable work");
    const startStage = resumeStageForHistory(jobs);
    const now = Date.now();
    const previousStage = PROCESSING_STAGES[stageIndex(startStage) - 1];
    await ctx.db.patch(projectId, {
      status: "processing",
      activeStage: startStage,
      progress: previousStage ? progressAfterStage(previousStage) : 1,
      errorMessage: undefined,
      updatedAt: now,
    });
    const workflowId = await beginWorkflow(ctx, projectId, video._id, startStage);
    console.info(JSON.stringify({ event: "project.retry_started", projectId, userId, stage: startStage, workflowId }));
    return { workflowId, startStage };
  },
});

export const expireUploadIntents = internalMutation({
  args: {},
  returns: v.object({ expired: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    const intents = await ctx.db.query("uploadIntents").withIndex("by_status_and_expiresAt", (q) => q.eq("status", "pending").lte("expiresAt", now)).take(100);
    for (const intent of intents) await ctx.db.patch(intent._id, { status: "expired", updatedAt: now });
    return { expired: intents.length };
  },
});

async function beginWorkflow(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  videoId: Id<"videos">,
  startStage?: ProcessingStage,
) {
  const workflowId: WorkflowId = await start(
    ctx,
    internal.processing.projectWorkflow,
    { projectId, videoId, ...(startStage ? { startStage } : {}) },
    { onComplete: internal.processing.handleWorkflowComplete, context: { projectId } },
  );
  await ctx.db.patch(projectId, { workflowId: String(workflowId), updatedAt: Date.now() });
  return String(workflowId);
}

function cleanTitle(value: string) {
  const title = value.trim().replace(/\s+/g, " ");
  if (!title || title.length > 140) throw new Error("Project title must contain 1 to 140 characters");
  return title;
}

function cleanFilename(value: string) {
  const filename = value.trim();
  if (!filename || filename.length > 240 || filename.includes("/") || filename.includes("\\")) throw new Error("Source filename is invalid");
  return filename;
}

function validateUploadMetadata(fileSizeBytes: number, mimeType: string) {
  if (!Number.isInteger(fileSizeBytes) || fileSizeBytes <= 0 || fileSizeBytes > PRODUCT_LIMITS.maxSourceFileBytes) throw new Error("Video must be between 1 byte and 5 GB");
  if (!supportedUploadTypes.has(mimeType)) throw new Error("Unsupported video type");
}

function assertOwnedSourceKey(userId: Id<"users">, objectKey: string) {
  if (!objectKey.startsWith(`${userId}/sources/`) || objectKey.length > 500 || objectKey.includes("..") || objectKey.includes("\\")) throw new Error("Upload key does not belong to this user");
}

async function enforceProjectCapacity(ctx: MutationCtx, userId: Id<"users">) {
  const processing = await ctx.db.query("projects").withIndex("by_userId_and_status", (q) => q.eq("userId", userId).eq("status", "processing")).take(PRODUCT_LIMITS.maxConcurrentProjectsPerUser);
  if (processing.length >= PRODUCT_LIMITS.maxConcurrentProjectsPerUser) throw new Error(`Only ${PRODUCT_LIMITS.maxConcurrentProjectsPerUser} projects can process at once`);
}

function validatedYoutubeUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Enter a valid YouTube URL");
  const hostname = url.hostname.toLowerCase();
  const videoId = hostname === "youtu.be"
    ? url.pathname.split("/").filter(Boolean)[0]
    : (hostname === "youtube.com" || hostname === "www.youtube.com" || hostname === "m.youtube.com") && url.pathname === "/watch"
      ? url.searchParams.get("v")
      : null;
  if (!videoId || !/^[a-zA-Z0-9_-]{6,20}$/.test(videoId)) throw new Error("Enter a valid YouTube video URL");
  url.username = "";
  url.password = "";
  url.hash = "";
  return url;
}

function validatedGoogleDriveUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Enter a valid Google Drive file URL");
  const hostname = url.hostname.toLowerCase();
  if (hostname !== "drive.google.com" && hostname !== "www.drive.google.com" && hostname !== "drive.usercontent.google.com") {
    throw new Error("Enter a valid Google Drive file URL");
  }
  const pathMatch = url.pathname.match(/\/file\/d\/([^/]+)/i);
  const fileId = pathMatch?.[1] ?? url.searchParams.get("id");
  if (!fileId || !/^[a-zA-Z0-9_-]{3,200}$/.test(fileId)) throw new Error("Enter a valid Google Drive file URL");
  return `https://drive.google.com/file/d/${fileId}/view`;
}
