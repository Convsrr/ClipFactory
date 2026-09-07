import { WorkflowManager, vResultValidator, vWorkflowId } from "@convex-dev/workflow";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { PROCESSING_STAGES, stageIndex } from "../shared/reliability";
import { stageNameValidator, stageResultValidator } from "./lib/stages";

const workflow = new WorkflowManager(components.workflow, {
  workpoolOptions: {
    maxParallelism: 8,
    retryActionsByDefault: true,
    defaultRetryBehavior: { maxAttempts: 3, initialBackoffMs: 1000, base: 2 },
  },
});

export const projectWorkflow = workflow.define({
  args: { projectId: v.id("projects"), videoId: v.id("videos"), startStage: v.optional(stageNameValidator) },
  returns: v.null(),
}).handler(async (step, args): Promise<null> => {
  const firstStageIndex = args.startStage ? stageIndex(args.startStage) : 0;
  if (firstStageIndex < 0) throw new Error("Invalid workflow start stage");

  for (const stage of PROCESSING_STAGES.slice(firstStageIndex)) {
    const queued = await step.runMutation(internal.renderJobs.queue, {
      projectId: args.projectId,
      videoId: args.videoId,
      type: stage,
      workflowId: String(step.workflowId),
    }, { name: `queue:${stage}` });
    try {
      if (stage === "analyse") {
        const result = await step.runAction(internal.aiActions.analyseProject, {
          projectId: args.projectId,
          videoId: args.videoId,
        }, { name: "analyse:g0i", retry: true });
        await step.runMutation(internal.renderJobs.completeLocal, { jobId: queued.jobId, metadata: result }, { name: "complete:analyse" });
        await step.runMutation(internal.renderJobs.applyStageOutputs, {
          jobId: queued.jobId,
          projectId: args.projectId,
          videoId: args.videoId,
          stage,
        }, { name: "apply:analyse" });
        continue;
      }

      const result = await step.awaitEvent({ name: queued.eventName, validator: stageResultValidator });
      if (!result.ok) throw new Error(result.errorMessage ?? `${stage} failed`);
      await step.runMutation(internal.renderJobs.applyStageOutputs, {
        jobId: queued.jobId,
        projectId: args.projectId,
        videoId: args.videoId,
        stage,
        outputs: result.outputs,
      }, { name: `apply:${stage}` });
    } catch (error) {
      await step.runMutation(internal.renderJobs.fail, {
        jobId: queued.jobId,
        errorMessage: error instanceof Error ? error.message : `${stage} failed`,
        errorCode: "WORKFLOW_STAGE_FAILED",
        retryable: false,
      }, { name: `fail:${stage}` });
      throw error;
    }
  }
  await step.runMutation(internal.processing.markProjectComplete, { projectId: args.projectId, videoId: args.videoId }, { name: "complete:project" });
  return null;
});

export const markProjectComplete = internalMutation({
  args: { projectId: v.id("projects"), videoId: v.id("videos") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [project, video, clips] = await Promise.all([
      ctx.db.get(args.projectId),
      ctx.db.get(args.videoId),
      ctx.db.query("clips").withIndex("by_projectId", (q) => q.eq("projectId", args.projectId)).take(20),
    ]);
    if (!project || !video || video.projectId !== project._id) throw new Error("Project completion target is invalid");
    if (!clips.length || clips.some((clip) => !clip.finalObjectKey || !clip.thumbnailObjectKey)) {
      throw new Error("Required rendered clip outputs are missing");
    }
    const now = Date.now();
    await ctx.db.patch(args.projectId, { status: "complete", progress: 100, activeStage: "thumbnail_render", errorMessage: undefined, updatedAt: now });
    await ctx.db.patch(args.videoId, { uploadStatus: "complete", updatedAt: now });
    return null;
  },
});

export const handleWorkflowComplete = internalMutation({
  args: { workflowId: vWorkflowId, result: vResultValidator, context: v.object({ projectId: v.id("projects") }) },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.result.kind === "success") return null;
    const project = await ctx.db.get(args.context.projectId);
    if (!project || project.status === "complete") return null;
    const message = args.result.kind === "failed" ? args.result.error : "Processing was cancelled";
    await ctx.db.patch(args.context.projectId, { status: "failed", errorMessage: message.slice(0, 500), updatedAt: Date.now() });
    return null;
  },
});
