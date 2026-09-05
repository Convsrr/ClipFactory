import { start, type WorkflowId } from "@convex-dev/workflow";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import { presentClip, presentProjectSummary } from "./lib/presenters";
import { clipSummaryValidator, projectSummaryValidator, timelineItemValidator } from "./lib/validators";

const stages = ["ingest", "transcribe", "analyse", "scene_detect", "face_track", "caption_render", "clip_render", "thumbnail_render"] as const;

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
      sourceType: v.union(v.literal("upload"), v.literal("youtube")),
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
    const user = await ctx.db.get(userId);
    if (!user || user.creditsRemaining <= 0) throw new Error("No processing credits remain");
    if (!args.objectKey.startsWith(`${userId}/sources/`)) throw new Error("Upload key does not belong to this user");
    if (args.fileSizeBytes <= 0 || args.fileSizeBytes > 5 * 1024 * 1024 * 1024) throw new Error("Video must be between 1 byte and 5 GB");
    if (!new Set(["video/mp4", "video/quicktime", "video/webm"]).has(args.mimeType)) throw new Error("Unsupported video type");
    const title = cleanTitle(args.title);
    const now = Date.now();
    const projectId = await ctx.db.insert("projects", { userId, title, sourceType: "upload", status: "processing", activeStage: "ingest", progress: 1, createdAt: now, updatedAt: now });
    const videoId = await ctx.db.insert("videos", { projectId, userId, originalUrl: args.originalUrl, originalObjectKey: args.objectKey, sourceFilename: args.sourceFilename, mimeType: args.mimeType, fileSizeBytes: args.fileSizeBytes, uploadStatus: "uploaded", createdAt: now, updatedAt: now });
    await beginWorkflow(ctx, projectId, videoId);
    return { projectId: projectId as string, videoId: videoId as string };
  },
});

export const createFromYoutube = mutation({
  args: { title: v.string(), youtubeUrl: v.string() },
  returns: v.object({ projectId: v.string(), videoId: v.string() }),
  handler: async (ctx, args): Promise<{ projectId: string; videoId: string }> => {
    const userId = await requireUserId(ctx);
    const user = await ctx.db.get(userId);
    if (!user || user.creditsRemaining <= 0) throw new Error("No processing credits remain");
    const url = new URL(args.youtubeUrl);
    const allowedHost = url.hostname === "youtu.be" || url.hostname === "youtube.com" || url.hostname.endsWith(".youtube.com");
    if (!allowedHost || url.protocol !== "https:") throw new Error("Enter a valid YouTube URL");
    const now = Date.now();
    const projectId = await ctx.db.insert("projects", { userId, title: cleanTitle(args.title), sourceType: "youtube", status: "processing", activeStage: "ingest", progress: 1, createdAt: now, updatedAt: now });
    const videoId = await ctx.db.insert("videos", { projectId, userId, originalUrl: url.toString(), uploadStatus: "uploaded", createdAt: now, updatedAt: now });
    await beginWorkflow(ctx, projectId, videoId);
    return { projectId: projectId as string, videoId: videoId as string };
  },
});

async function beginWorkflow(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  videoId: Id<"videos">,
) {
  const workflowId: WorkflowId = await start(
    ctx,
    internal.processing.projectWorkflow,
    { projectId, videoId },
    { onComplete: internal.processing.handleWorkflowComplete, context: { projectId } },
  );
  await ctx.db.patch(projectId, { workflowId: String(workflowId), updatedAt: Date.now() });
}

function cleanTitle(value: string) {
  const title = value.trim().replace(/\s+/g, " ");
  if (!title || title.length > 140) throw new Error("Project title must contain 1 to 140 characters");
  return title;
}
