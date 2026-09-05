import { WorkflowManager, vResultValidator, vWorkflowId } from "@convex-dev/workflow";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { stageResultValidator } from "./lib/stages";

const workflow = new WorkflowManager(components.workflow, {
  workpoolOptions: {
    maxParallelism: 8,
    retryActionsByDefault: true,
    defaultRetryBehavior: { maxAttempts: 3, initialBackoffMs: 1000, base: 2 },
  },
});

const stages = ["ingest", "transcribe", "analyse", "scene_detect", "face_track", "caption_render", "clip_render", "thumbnail_render"] as const;

export const projectWorkflow = workflow.define({
  args: { projectId: v.id("projects"), videoId: v.id("videos") },
  returns: v.null(),
}).handler(async (step, args): Promise<null> => {
  for (const stage of stages) {
    const jobId = await step.runMutation(internal.renderJobs.queue, { projectId: args.projectId, type: stage, workflowId: String(step.workflowId) }, { name: `queue:${stage}` });
    try {
      if (stage === "analyse") {
        const result = await step.runAction(internal.aiActions.analyseProject, args, { name: "analyse:g0i", retry: true });
        await step.runMutation(internal.renderJobs.completeLocal, { jobId, metadata: result }, { name: "complete:analyse" });
        await step.runMutation(internal.renderJobs.applyStageOutputs, { jobId, projectId: args.projectId, videoId: args.videoId, stage }, { name: "apply:analyse" });
        continue;
      }
      const eventName = `stage:${jobId}`;
      await step.runAction(internal.worker.dispatchStage, { jobId, projectId: args.projectId, videoId: args.videoId, stage, workflowId: String(step.workflowId), eventName }, { name: `dispatch:${stage}`, retry: true });
      const result = await step.awaitEvent({ name: eventName, validator: stageResultValidator });
      if (!result.ok) throw new Error(result.errorMessage ?? `${stage} failed`);
      await step.runMutation(internal.renderJobs.applyStageOutputs, { jobId, projectId: args.projectId, videoId: args.videoId, stage, outputs: result.outputs }, { name: `apply:${stage}` });
    } catch (error) {
      await step.runMutation(internal.renderJobs.fail, { jobId, errorMessage: error instanceof Error ? error.message : `${stage} failed` }, { name: `fail:${stage}` });
      throw error;
    }
  }
  await step.runMutation(internal.processing.markProjectComplete, args, { name: "complete:project" });
  return null;
});

export const markProjectComplete = internalMutation({
  args: { projectId: v.id("projects"), videoId: v.id("videos") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.projectId, { status: "complete", progress: 100, updatedAt: now });
    await ctx.db.patch(args.videoId, { uploadStatus: "complete", updatedAt: now });
    return null;
  },
});

export const handleWorkflowComplete = internalMutation({
  args: { workflowId: vWorkflowId, result: vResultValidator, context: v.object({ projectId: v.id("projects") }) },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.result.kind === "success") return null;
    const message = args.result.kind === "failed" ? args.result.error : "Processing was cancelled";
    await ctx.db.patch(args.context.projectId, { status: "failed", errorMessage: message.slice(0, 500), updatedAt: Date.now() });
    return null;
  },
});
