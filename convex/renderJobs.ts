import { sendEvent, type WorkflowId } from "@convex-dev/workflow";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { stageNameValidator, stageResultValidator, stageOutputsValidator } from "./lib/stages";

export const queue = internalMutation({
  args: { projectId: v.id("projects"), type: stageNameValidator, workflowId: v.string() },
  returns: v.id("renderJobs"),
  handler: async (ctx, args) => {
    const now = Date.now();
    return ctx.db.insert("renderJobs", { projectId: args.projectId, type: args.type, status: "queued", progress: 0, workflowId: args.workflowId, attempt: 1, createdAt: now, updatedAt: now });
  },
});

export const markRunning = internalMutation({
  args: { jobId: v.id("renderJobs"), workerRef: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, { status: "running", progress: 2, workerRef: args.workerRef, updatedAt: Date.now() });
    return null;
  },
});

export const completeLocal = internalMutation({
  args: { jobId: v.id("renderJobs"), metadata: v.optional(v.any()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, { status: "complete", progress: 100, metadata: args.metadata, appliedAt: Date.now(), updatedAt: Date.now() });
    return null;
  },
});

export const completeFromWorker = internalMutation({
  args: { jobId: v.string(), workflowId: v.string(), eventName: v.string(), result: stageResultValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const jobId = ctx.db.normalizeId("renderJobs", args.jobId);
    if (!jobId) throw new Error("Worker job does not exist");
    const job = await ctx.db.get(jobId);
    if (!job || job.workflowId !== args.workflowId) throw new Error("Worker callback does not match the queued job");
    if (job.status === "complete" || job.status === "failed") return null;
    await ctx.db.patch(jobId, { status: args.result.ok ? "complete" : "failed", progress: args.result.ok ? 100 : job.progress, errorMessage: args.result.errorMessage, metadata: args.result.outputs, updatedAt: Date.now() });
    await sendEvent(ctx, components.workflow, {
      name: args.eventName,
      workflowId: args.workflowId as WorkflowId,
      value: args.result,
    });
    return null;
  },
});

export const applyStageOutputs = internalMutation({
  args: { jobId: v.id("renderJobs"), projectId: v.id("projects"), videoId: v.id("videos"), stage: stageNameValidator, outputs: v.optional(stageOutputsValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [job, project, video] = await Promise.all([ctx.db.get(args.jobId), ctx.db.get(args.projectId), ctx.db.get(args.videoId)]);
    if (!job || !project || !video || job.type !== args.stage) throw new Error("Stage output target is invalid");
    if (job.appliedAt) return null;
    const outputs = args.outputs;
    const now = Date.now();
    if (args.stage === "ingest" && outputs?.durationSec) {
      const credits = Math.max(1, Math.ceil(outputs.durationSec / 60));
      const user = await ctx.db.get(project.userId);
      if (!user || user.creditsRemaining < credits) throw new Error(`This source needs ${credits} credits`);
      await ctx.db.patch(project.userId, { creditsRemaining: user.creditsRemaining - credits, creditsUsedThisPeriod: user.creditsUsedThisPeriod + credits, updatedAt: now });
      await ctx.db.insert("usageLedger", { userId: project.userId, projectId: project._id, kind: "processing_debit", creditsDelta: -credits, notes: `${credits} source-minute credits`, createdAt: now });
      await ctx.db.patch(video._id, { durationSec: outputs.durationSec, width: outputs.width, height: outputs.height, fps: outputs.fps, proxyUrl: outputs.proxyUrl, audioUrl: outputs.audioUrl, proxyObjectKey: outputs.proxyObjectKey, audioObjectKey: outputs.audioObjectKey, uploadStatus: "processing", updatedAt: now });
    }
    if (args.stage === "transcribe" && outputs?.segments && outputs.fullText) {
      await ctx.db.insert("transcripts", { projectId: project._id, videoId: video._id, language: outputs.language, fullText: outputs.fullText, segments: outputs.segments, words: outputs.words, engine: outputs.engine ?? "faster-whisper", status: "complete", createdAt: now, updatedAt: now });
    }
    if (outputs?.clipAssets) {
      for (const asset of outputs.clipAssets) {
        const clipId = ctx.db.normalizeId("clips", asset.clipId);
        if (!clipId) continue;
        const clip = await ctx.db.get(clipId);
        if (!clip || clip.projectId !== project._id) continue;
        await ctx.db.patch(clipId, { previewUrl: asset.previewUrl ?? clip.previewUrl, finalUrl: asset.finalUrl ?? clip.finalUrl, thumbnailUrl: asset.thumbnailUrl ?? clip.thumbnailUrl, previewObjectKey: asset.previewObjectKey ?? clip.previewObjectKey, finalObjectKey: asset.finalObjectKey ?? clip.finalObjectKey, thumbnailObjectKey: asset.thumbnailObjectKey ?? clip.thumbnailObjectKey, status: args.stage === "thumbnail_render" || args.stage === "clip_render" ? "complete" : clip.status, updatedAt: now });
      }
    }
    const stageIndex = ["ingest", "transcribe", "analyse", "scene_detect", "face_track", "caption_render", "clip_render", "thumbnail_render"].indexOf(args.stage);
    const nextStage = ["transcribe", "analyse", "scene_detect", "face_track", "caption_render", "clip_render", "thumbnail_render", "thumbnail_render"][stageIndex];
    await ctx.db.patch(project._id, { progress: Math.round(((stageIndex + 1) / 8) * 100), activeStage: nextStage as NonNullable<typeof project.activeStage>, updatedAt: now });
    await ctx.db.patch(job._id, { appliedAt: now, updatedAt: now });
    return null;
  },
});
