import { sendEvent, type WorkflowId } from "@convex-dev/workflow";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { PRODUCT_LIMITS, RELIABILITY_DEFAULTS, nextStage, progressAfterStage, retryBackoffMs } from "../shared/reliability";
import { renderJobMetadataValidator, stageNameValidator, stageOutputsValidator, stageResultValidator } from "./lib/stages";

const callbackDispositionValidator = v.union(
  v.literal("applied"),
  v.literal("duplicate"),
  v.literal("requeued"),
  v.literal("stale"),
);

export const queue = internalMutation({
  args: {
    projectId: v.id("projects"),
    videoId: v.id("videos"),
    type: stageNameValidator,
    workflowId: v.string(),
  },
  returns: v.object({ jobId: v.id("renderJobs"), eventName: v.string() }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("renderJobs")
      .withIndex("by_workflowId_and_type", (q) => q.eq("workflowId", args.workflowId).eq("type", args.type))
      .first();
    if (existing) return { jobId: existing._id, eventName: existing.eventName ?? `stage:${existing._id}` };

    const [project, video] = await Promise.all([ctx.db.get(args.projectId), ctx.db.get(args.videoId)]);
    if (!project || !video || video.projectId !== project._id) throw new Error("Cannot queue a job for an inconsistent project/video pair");
    const now = Date.now();
    const jobId = await ctx.db.insert("renderJobs", {
      projectId: args.projectId,
      videoId: args.videoId,
      type: args.type,
      status: "queued",
      progress: 0,
      workflowId: args.workflowId,
      attempt: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const eventName = `stage:${jobId}`;
    await ctx.db.patch(jobId, { eventName });
    return { jobId, eventName };
  },
});

export const claimNext = internalMutation({
  args: { workerId: v.string() },
  returns: v.union(
    v.object({ jobId: v.id("renderJobs"), attempt: v.number(), leaseExpiresAt: v.number() }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const workerId = cleanWorkerId(args.workerId);
    const now = Date.now();
    const [indexedCandidates, legacyCandidates] = await Promise.all([
      ctx.db.query("renderJobs").withIndex("by_status_and_nextAttemptAt", (q) => q.eq("status", "queued").lte("nextAttemptAt", now)).order("asc").take(32),
      ctx.db.query("renderJobs").withIndex("by_status", (q) => q.eq("status", "queued")).order("asc").take(32),
    ]);
    const candidates = uniqueJobs([...indexedCandidates, ...legacyCandidates]);
    const job = candidates.find((candidate) => candidate.type !== "analyse" && (candidate.nextAttemptAt ?? 0) <= now && candidate.attempt < maximumAttempts());
    if (!job) return null;

    const attempt = job.attempt + 1;
    const leaseExpiresAt = now + leaseDurationMs();
    await ctx.db.patch(job._id, {
      status: "running",
      progress: Math.max(2, job.progress),
      workerId,
      workerRef: workerId,
      claimedAt: now,
      processingStartedAt: job.processingStartedAt ?? now,
      lastHeartbeatAt: now,
      leaseExpiresAt,
      nextAttemptAt: undefined,
      attempt,
      errorMessage: undefined,
      errorCode: undefined,
      retryable: undefined,
      updatedAt: now,
    });
    console.info(JSON.stringify({ event: "worker.claimed_job", workerId, jobId: job._id, projectId: job.projectId, stage: job.type, attempt }));
    return { jobId: job._id, attempt, leaseExpiresAt };
  },
});

export const heartbeat = internalMutation({
  args: {
    jobId: v.string(),
    workerId: v.string(),
    attempt: v.number(),
    progress: v.optional(v.number()),
  },
  returns: v.object({ accepted: v.boolean(), leaseExpiresAt: v.union(v.number(), v.null()) }),
  handler: async (ctx, args) => {
    const jobId = ctx.db.normalizeId("renderJobs", args.jobId);
    if (!jobId) return { accepted: false, leaseExpiresAt: null };
    const job = await ctx.db.get(jobId);
    const now = Date.now();
    if (!job || job.status !== "running" || job.workerId !== args.workerId || job.attempt !== args.attempt || (job.leaseExpiresAt ?? 0) <= now) {
      return { accepted: false, leaseExpiresAt: null };
    }
    const leaseExpiresAt = now + leaseDurationMs();
    const progress = args.progress === undefined ? job.progress : Math.max(job.progress, Math.min(95, Math.max(2, Math.round(args.progress))));
    await ctx.db.patch(job._id, { lastHeartbeatAt: now, leaseExpiresAt, progress, updatedAt: now });
    return { accepted: true, leaseExpiresAt };
  },
});

export const completeLocal = internalMutation({
  args: { jobId: v.id("renderJobs"), metadata: v.optional(renderJobMetadataValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status === "complete") return null;
    if (job.status !== "queued") throw new Error("Local stage is not queued");
    const now = Date.now();
    await ctx.db.patch(args.jobId, { status: "complete", progress: 100, metadata: args.metadata, completedAt: now, completedAttempt: job.attempt, updatedAt: now });
    return null;
  },
});

export const fail = internalMutation({
  args: { jobId: v.id("renderJobs"), errorMessage: v.string(), errorCode: v.optional(v.string()), retryable: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status === "failed" || (job.status === "complete" && job.appliedAt)) return null;
    const now = Date.now();
    await ctx.db.patch(args.jobId, {
      status: "failed",
      errorMessage: args.errorMessage.slice(0, 500),
      errorCode: args.errorCode ?? "STAGE_FAILED",
      retryable: args.retryable ?? false,
      completedAt: now,
      completedAttempt: job.attempt,
      updatedAt: now,
    });
    return null;
  },
});

export const completeFromWorker = internalMutation({
  args: {
    jobId: v.string(),
    workflowId: v.string(),
    workerId: v.string(),
    attempt: v.number(),
    result: stageResultValidator,
  },
  returns: v.object({ disposition: callbackDispositionValidator, nextAttemptAt: v.union(v.number(), v.null()) }),
  handler: async (ctx, args) => {
    const jobId = ctx.db.normalizeId("renderJobs", args.jobId);
    if (!jobId) throw new Error("Worker job does not exist");
    const job = await ctx.db.get(jobId);
    if (!job || job.workflowId !== args.workflowId || !job.eventName) throw new Error("Worker callback does not match the queued job");
    const now = Date.now();

    if (job.status === "complete" || job.status === "failed") {
      const duplicate = job.completedAttempt === args.attempt && job.workerId === args.workerId;
      const disposition: "duplicate" | "stale" = duplicate ? "duplicate" : "stale";
      return { disposition, nextAttemptAt: null };
    }
    if (job.status !== "running" || job.workerId !== args.workerId || job.attempt !== args.attempt || (job.leaseExpiresAt ?? 0) <= now) {
      return { disposition: "stale" as const, nextAttemptAt: null };
    }
    if (!args.result.ok && args.result.retryable !== false && job.attempt < maximumAttempts()) {
      const nextAttemptAt = now + retryBackoffMs(job.attempt);
      await ctx.db.patch(jobId, {
        status: "queued",
        progress: Math.min(job.progress, 95),
        workerId: undefined,
        workerRef: undefined,
        claimedAt: undefined,
        leaseExpiresAt: undefined,
        lastHeartbeatAt: undefined,
        nextAttemptAt,
        errorMessage: args.result.errorMessage?.slice(0, 500) ?? "Worker stage failed",
        errorCode: args.result.errorCode ?? "TRANSIENT_WORKER_FAILURE",
        retryable: true,
        lastCallbackAt: now,
        updatedAt: now,
      });
      console.warn(JSON.stringify({ event: "job.requeued", jobId, projectId: job.projectId, stage: job.type, attempt: job.attempt, nextAttemptAt, errorClass: args.result.errorCode ?? "TRANSIENT_WORKER_FAILURE" }));
      return { disposition: "requeued" as const, nextAttemptAt };
    }

    const terminalResult = args.result.ok
      ? args.result
      : { ...args.result, errorMessage: args.result.errorMessage?.slice(0, 500) ?? "Worker stage failed", retryable: false };
    await ctx.db.patch(jobId, {
      status: terminalResult.ok ? "complete" : "failed",
      progress: terminalResult.ok ? 100 : job.progress,
      errorMessage: terminalResult.ok ? undefined : terminalResult.errorMessage,
      errorCode: terminalResult.ok ? undefined : terminalResult.errorCode ?? "WORKER_STAGE_FAILED",
      retryable: terminalResult.ok ? undefined : false,
      metadata: terminalResult.outputs,
      completedAt: now,
      completedAttempt: args.attempt,
      lastCallbackAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.renderJobs.deliverWorkflowEvent, { jobId, attempt: args.attempt });
    console.info(JSON.stringify({ event: terminalResult.ok ? "worker.completed_job" : "job.permanent_failure", workerId: args.workerId, jobId, projectId: job.projectId, stage: job.type, attempt: job.attempt, errorClass: terminalResult.errorCode }));
    return { disposition: "applied" as const, nextAttemptAt: null };
  },
});

export const applyStageOutputs = internalMutation({
  args: {
    jobId: v.id("renderJobs"),
    projectId: v.id("projects"),
    videoId: v.id("videos"),
    stage: stageNameValidator,
    outputs: v.optional(stageOutputsValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [job, project, video] = await Promise.all([ctx.db.get(args.jobId), ctx.db.get(args.projectId), ctx.db.get(args.videoId)]);
    if (!job || !project || !video || job.projectId !== project._id || job.videoId !== video._id || video.projectId !== project._id || job.type !== args.stage) {
      throw new Error("Stage output target is invalid");
    }
    if (job.appliedAt) return null;
    if (job.status !== "complete") throw new Error("Only a completed job can apply stage outputs");
    const outputs = args.outputs;
    const now = Date.now();

    if (args.stage === "ingest") {
      if (!outputs?.durationSec || !outputs.width || !outputs.height || !outputs.proxyObjectKey || !outputs.audioObjectKey) throw new Error("Ingest output is incomplete");
      if (outputs.durationSec > PRODUCT_LIMITS.maxSourceDurationSec) throw new Error("Source video exceeds the maximum duration");
      const credits = Math.max(1, Math.ceil(outputs.durationSec / 60));
      const idempotencyKey = `processing:${project._id}:source-minutes`;
      const existingDebit = await ctx.db.query("usageLedger").withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", idempotencyKey)).first();
      if (!existingDebit) {
        const user = await ctx.db.get(project.userId);
        if (!user || user.creditsRemaining < credits) throw new Error(`This source needs ${credits} credits`);
        await ctx.db.patch(project.userId, { creditsRemaining: user.creditsRemaining - credits, creditsUsedThisPeriod: user.creditsUsedThisPeriod + credits, updatedAt: now });
        await ctx.db.insert("usageLedger", {
          userId: project.userId,
          projectId: project._id,
          renderJobId: job._id,
          idempotencyKey,
          kind: "processing_debit",
          creditsDelta: -credits,
          reason: "source_minutes",
          notes: `${credits} source-minute credits`,
          createdAt: now,
        });
      }
      assertProjectObjectKey(project.userId, project._id, outputs.proxyObjectKey);
      assertProjectObjectKey(project.userId, project._id, outputs.audioObjectKey);
      await ctx.db.patch(video._id, {
        durationSec: outputs.durationSec,
        width: outputs.width,
        height: outputs.height,
        fps: outputs.fps,
        proxyUrl: outputs.proxyUrl,
        audioUrl: outputs.audioUrl,
        proxyObjectKey: outputs.proxyObjectKey,
        audioObjectKey: outputs.audioObjectKey,
        uploadStatus: "processing",
        updatedAt: now,
      });
    }

    if (args.stage === "transcribe" && outputs?.segments && outputs.fullText) {
      const existingTranscript = await ctx.db.query("transcripts").withIndex("by_renderJobId", (q) => q.eq("renderJobId", job._id)).first();
      if (!existingTranscript) {
        await ctx.db.insert("transcripts", {
          projectId: project._id,
          videoId: video._id,
          renderJobId: job._id,
          language: outputs.language,
          fullText: outputs.fullText,
          segments: outputs.segments,
          words: outputs.words,
          engine: outputs.engine ?? "faster-whisper",
          status: "complete",
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    if (outputs?.clipAssets) {
      for (const asset of outputs.clipAssets) {
        const clipId = ctx.db.normalizeId("clips", asset.clipId);
        if (!clipId) continue;
        const clip = await ctx.db.get(clipId);
        if (!clip || clip.projectId !== project._id) continue;
        for (const key of [asset.previewObjectKey, asset.finalObjectKey, asset.thumbnailObjectKey]) {
          if (key) assertProjectObjectKey(project.userId, project._id, key);
        }
        await ctx.db.patch(clipId, {
          previewUrl: asset.previewUrl ?? clip.previewUrl,
          finalUrl: asset.finalUrl ?? clip.finalUrl,
          thumbnailUrl: asset.thumbnailUrl ?? clip.thumbnailUrl,
          previewObjectKey: asset.previewObjectKey ?? clip.previewObjectKey,
          finalObjectKey: asset.finalObjectKey ?? clip.finalObjectKey,
          thumbnailObjectKey: asset.thumbnailObjectKey ?? clip.thumbnailObjectKey,
          status: args.stage === "thumbnail_render" || args.stage === "clip_render" ? "complete" : clip.status,
          updatedAt: now,
        });
      }
    }

    const followingStage = nextStage(args.stage);
    await ctx.db.patch(project._id, {
      progress: progressAfterStage(args.stage),
      activeStage: followingStage ?? args.stage,
      errorMessage: undefined,
      updatedAt: now,
    });
    await ctx.db.patch(job._id, { appliedAt: now, updatedAt: now });
    return null;
  },
});

export const watchdog = internalMutation({
  args: {},
  returns: v.object({ stale: v.number(), requeued: v.number(), failed: v.number(), repairedProjects: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    const [indexedExpired, legacyRunning] = await Promise.all([
      ctx.db.query("renderJobs").withIndex("by_status_and_leaseExpiresAt", (q) => q.eq("status", "running").lte("leaseExpiresAt", now)).order("asc").take(100),
      ctx.db.query("renderJobs").withIndex("by_status", (q) => q.eq("status", "running")).order("asc").take(100),
    ]);
    const expired = uniqueJobs([...indexedExpired, ...legacyRunning]).filter((job) => (job.leaseExpiresAt ?? 0) <= now);
    let requeued = 0;
    let failed = 0;
    for (const job of expired) {
      console.warn(JSON.stringify({ event: "job.stale_detected", jobId: job._id, projectId: job.projectId, workerId: job.workerId, stage: job.type, attempt: job.attempt }));
      if (job.attempt < maximumAttempts()) {
        const nextAttemptAt = now + retryBackoffMs(job.attempt);
        await ctx.db.patch(job._id, {
          status: "queued",
          workerId: undefined,
          workerRef: undefined,
          claimedAt: undefined,
          leaseExpiresAt: undefined,
          lastHeartbeatAt: undefined,
          nextAttemptAt,
          errorMessage: "Worker lease expired",
          errorCode: "WORKER_LEASE_EXPIRED",
          retryable: true,
          updatedAt: now,
        });
        requeued += 1;
        console.warn(JSON.stringify({ event: "job.requeued", jobId: job._id, projectId: job.projectId, stage: job.type, attempt: job.attempt, nextAttemptAt, errorClass: "WORKER_LEASE_EXPIRED" }));
      } else {
        await permanentlyFailExpiredJob(ctx, job, now);
        failed += 1;
      }
    }

    let repairedProjects = 0;
    const processingProjects = await ctx.db.query("projects").withIndex("by_status", (q) => q.eq("status", "processing")).take(50);
    for (const project of processingProjects) {
      const jobs = await ctx.db.query("renderJobs").withIndex("by_projectId", (q) => q.eq("projectId", project._id)).order("desc").take(64);
      const currentJobs = jobs.filter((job) => job.workflowId === project.workflowId);
      const hasRecoverableWork = currentJobs.some((job) => job.status === "queued" || job.status === "running");
      const terminalFailure = currentJobs.find((job) => job.status === "failed" && job.retryable === false);
      if (!hasRecoverableWork && terminalFailure) {
        await ctx.db.patch(project._id, { status: "failed", activeStage: terminalFailure.type, errorMessage: terminalFailure.errorMessage ?? "Processing failed", updatedAt: now });
        repairedProjects += 1;
      } else {
        const unapplied = currentJobs.find((job) => job.status === "complete" && !job.appliedAt && job.videoId);
        if (unapplied?.videoId) {
          await ctx.scheduler.runAfter(0, internal.renderJobs.applyStageOutputs, {
            jobId: unapplied._id,
            projectId: project._id,
            videoId: unapplied.videoId,
            stage: unapplied.type,
            outputs: isStageOutputs(unapplied.metadata) ? unapplied.metadata : undefined,
          });
        }
      }
    }
    return { stale: expired.length, requeued, failed, repairedProjects };
  },
});

export const deliverWorkflowEvent = internalMutation({
  args: { jobId: v.id("renderJobs"), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.eventSentAt || job.completedAttempt !== args.attempt || !job.workflowId || !job.eventName) return null;
    if (job.status !== "complete" && job.status !== "failed") return null;
    const value = job.status === "complete"
      ? { ok: true as const, outputs: isStageOutputs(job.metadata) ? job.metadata : undefined }
      : { ok: false as const, errorMessage: job.errorMessage ?? "Worker stage failed", errorCode: job.errorCode ?? "WORKER_STAGE_FAILED", retryable: false };
    await sendEvent(ctx, components.workflow, {
      name: job.eventName,
      workflowId: job.workflowId as WorkflowId,
      validator: stageResultValidator,
      value,
    });
    await ctx.db.patch(job._id, { eventSentAt: Date.now(), updatedAt: Date.now() });
    return null;
  },
});

async function permanentlyFailExpiredJob(ctx: MutationCtx, job: Doc<"renderJobs">, now: number) {
  await ctx.db.patch(job._id, {
    status: "failed",
    errorMessage: "Worker lease expired after the maximum number of attempts",
    errorCode: "WORKER_LEASE_EXHAUSTED",
    retryable: false,
    completedAt: now,
    completedAttempt: job.attempt,
    updatedAt: now,
  });
  if (job.workflowId && job.eventName) {
    await ctx.scheduler.runAfter(0, internal.renderJobs.deliverWorkflowEvent, { jobId: job._id, attempt: job.attempt });
  }
  console.error(JSON.stringify({ event: "job.permanent_failure", jobId: job._id, projectId: job.projectId, workerId: job.workerId, stage: job.type, attempt: job.attempt, errorClass: "WORKER_LEASE_EXHAUSTED" }));
}

function maximumAttempts() {
  return boundedEnvironmentNumber("WORKER_MAX_ATTEMPTS", RELIABILITY_DEFAULTS.workerMaxAttempts, 1, 8);
}

function leaseDurationMs() {
  return boundedEnvironmentNumber("WORKER_LEASE_MS", RELIABILITY_DEFAULTS.workerLeaseMs, 2 * 60 * 1000, 30 * 60 * 1000);
}

function boundedEnvironmentNumber(name: string, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(parsed)));
}

function cleanWorkerId(value: string) {
  const workerId = value.trim();
  if (!workerId || workerId.length > 120 || !/^[a-zA-Z0-9._:-]+$/.test(workerId)) throw new Error("Invalid worker identifier");
  return workerId;
}

function assertProjectObjectKey(userId: Id<"users">, projectId: Id<"projects">, key: string) {
  if (!key.startsWith(`${userId}/projects/${projectId}/`) || key.includes("..") || key.includes("\\")) throw new Error("Worker output key is outside the project namespace");
}

function isStageOutputs(value: unknown): value is {
  durationSec?: number;
  width?: number;
  height?: number;
  fps?: number;
  proxyUrl?: string;
  audioUrl?: string;
  proxyObjectKey?: string;
  audioObjectKey?: string;
  language?: string;
  fullText?: string;
  segments?: Array<{ startSec: number; endSec: number; text: string; speaker?: string }>;
  words?: Array<{ startSec: number; endSec: number; text: string; confidence?: number }>;
  engine?: string;
  clipAssets?: Array<{ clipId: string; previewUrl?: string; finalUrl?: string; thumbnailUrl?: string; previewObjectKey?: string; finalObjectKey?: string; thumbnailObjectKey?: string }>;
  metadata?: unknown;
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  const outputKeys = new Set([
    "durationSec", "width", "height", "fps", "proxyUrl", "audioUrl", "proxyObjectKey", "audioObjectKey",
    "language", "fullText", "segments", "words", "engine", "clipAssets", "metadata",
  ]);
  return keys.every((key) => outputKeys.has(key));
}

function uniqueJobs(jobs: Doc<"renderJobs">[]) {
  return [...new Map(jobs.map((job) => [job._id, job])).values()];
}
