"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { stageNameValidator } from "./lib/stages";

export const dispatchStage = internalAction({
  args: { jobId: v.id("renderJobs"), projectId: v.id("projects"), videoId: v.id("videos"), stage: stageNameValidator, workflowId: v.string(), eventName: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const workerBaseUrl = requiredEnv("WORKER_BASE_URL");
    const workerSecret = requiredEnv("WORKER_SHARED_SECRET");
    const callbackSecret = requiredEnv("WORKER_CALLBACK_SECRET");
    const convexSiteUrl = requiredEnv("CONVEX_SITE_URL");
    const payload = await ctx.runQuery(internal.workerData.payload, { jobId: args.jobId, projectId: args.projectId, videoId: args.videoId, stage: args.stage });
    const response = await fetch(`${workerBaseUrl.replace(/\/$/, "")}/jobs`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${workerSecret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, workflowId: args.workflowId, eventName: args.eventName, callbackUrl: `${convexSiteUrl.replace(/\/$/, "")}/worker/callback`, callbackSecret }),
    });
    if (!response.ok) throw new Error(`Worker rejected ${args.stage} with HTTP ${response.status}`);
    const result = await response.json() as { workerRef?: string };
    await ctx.runMutation(internal.renderJobs.markRunning, { jobId: args.jobId, workerRef: result.workerRef });
    return null;
  },
});

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}
