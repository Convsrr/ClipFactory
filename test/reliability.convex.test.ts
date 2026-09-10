import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import workflowTest from "@convex-dev/workflow/test";
import { api, components, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { resumeStageForHistory } from "../shared/reliability";

const modules = import.meta.glob("../convex/**/*.ts");

type Seed = { userId: Id<"users">; projectId: Id<"projects">; videoId: Id<"videos">; jobId: Id<"renderJobs">; workflowId: string };

async function seedJob(options: {
  status?: "queued" | "running" | "complete" | "failed";
  attempt?: number;
  workerId?: string;
  leaseExpiresAt?: number;
  stage?: "ingest" | "transcribe" | "scene_detect" | "face_track" | "caption_render" | "clip_render" | "thumbnail_render";
  nextAttemptAt?: number;
  completedAttempt?: number;
} = {}) {
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  const workflowId = await t.mutation(components.workflow.workflow.create, {
    workflowName: "reliability-test",
    workflowHandle: "function://;processing.projectWorkflow",
    workflowArgs: {},
    createOnly: true,
  });
  const seeded = await t.run(async (ctx): Promise<Seed> => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      name: "Reliability Test",
      email: `test-${Math.random()}@example.com`,
      plan: "creator",
      creditsRemaining: 600,
      creditsUsedThisPeriod: 0,
      createdAt: now,
      updatedAt: now,
    });
    const projectId = await ctx.db.insert("projects", {
      userId,
      title: "Test project",
      sourceType: "upload",
      status: "processing",
      activeStage: options.stage ?? "ingest",
      progress: 1,
      workflowId,
      createdAt: now,
      updatedAt: now,
    });
    const videoId = await ctx.db.insert("videos", {
      projectId,
      userId,
      originalObjectKey: `${userId}/sources/source.mp4`,
      sourceFilename: "source.mp4",
      mimeType: "video/mp4",
      fileSizeBytes: 1_000,
      uploadStatus: "uploaded",
      createdAt: now,
      updatedAt: now,
    });
    const jobId = await ctx.db.insert("renderJobs", {
      projectId,
      videoId,
      type: options.stage ?? "ingest",
      status: options.status ?? "queued",
      progress: 0,
      workflowId,
      eventName: "stage:test",
      attempt: options.attempt ?? 0,
      workerId: options.workerId,
      workerRef: options.workerId,
      claimedAt: options.workerId ? now : undefined,
      lastHeartbeatAt: options.workerId ? now : undefined,
      leaseExpiresAt: options.leaseExpiresAt,
      nextAttemptAt: options.nextAttemptAt ?? (options.status === "running" ? undefined : now - 1),
      completedAttempt: options.completedAttempt,
      createdAt: now,
      updatedAt: now,
    });
    return { userId, projectId, videoId, jobId, workflowId };
  });
  return { t, ...seeded };
}

describe("durable worker claims", () => {
  test("a queued job is atomically claimed by only one of two workers", async () => {
    const { t, jobId } = await seedJob();
    const [first, second] = await Promise.all([
      t.mutation(internal.renderJobs.claimNext, { workerId: "worker-a" }),
      t.mutation(internal.renderJobs.claimNext, { workerId: "worker-b" }),
    ]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    const job = await t.run((ctx) => ctx.db.get(jobId));
    expect(job?.status).toBe("running");
    expect(job?.attempt).toBe(1);
  });

  test("a worker can heartbeat its own lease but another worker cannot", async () => {
    const { t, jobId } = await seedJob();
    await t.mutation(internal.renderJobs.claimNext, { workerId: "worker-a" });
    const accepted = await t.mutation(internal.renderJobs.heartbeat, { jobId, workerId: "worker-a", attempt: 1, progress: 45 });
    const rejected = await t.mutation(internal.renderJobs.heartbeat, { jobId, workerId: "worker-b", attempt: 1, progress: 80 });
    expect(accepted.accepted).toBe(true);
    expect(rejected.accepted).toBe(false);
    expect((await t.run((ctx) => ctx.db.get(jobId)))?.progress).toBe(45);
  });

  test("a malformed heartbeat job identifier is rejected without throwing", async () => {
    const { t } = await seedJob();
    const result = await t.mutation(internal.renderJobs.heartbeat, {
      jobId: "not-a-render-job-id",
      workerId: "worker-a",
      attempt: 1,
    });
    expect(result).toEqual({ accepted: false, leaseExpiresAt: null });
  });

  test("jobs scheduled for future backoff are not claimable", async () => {
    const { t } = await seedJob({ nextAttemptAt: Date.now() + 60_000 });
    expect(await t.mutation(internal.renderJobs.claimNext, { workerId: "worker-a" })).toBeNull();
  });
});

describe("watchdog recovery", () => {
  test("an expired lease is requeued and increments on the next claim", async () => {
    const { t, jobId } = await seedJob({ status: "running", attempt: 1, workerId: "dead-worker", leaseExpiresAt: Date.now() - 1 });
    const result = await t.mutation(internal.renderJobs.watchdog, {});
    expect(result).toMatchObject({ stale: 1, requeued: 1, failed: 0 });
    await t.run(async (ctx) => {
      const job = await ctx.db.get(jobId);
      expect(job?.status).toBe("queued");
      expect(job?.errorCode).toBe("WORKER_LEASE_EXPIRED");
      await ctx.db.patch(jobId, { nextAttemptAt: Date.now() - 1 });
    });
    const claim = await t.mutation(internal.renderJobs.claimNext, { workerId: "worker-b" });
    expect(claim?.attempt).toBe(2);
  });

  test("an exhausted expired lease becomes permanently failed", async () => {
    const { t, jobId } = await seedJob({ status: "running", attempt: 3, workerId: "dead-worker", leaseExpiresAt: Date.now() - 1 });
    const result = await t.mutation(internal.renderJobs.watchdog, {});
    expect(result.failed).toBe(1);
    const job = await t.run((ctx) => ctx.db.get(jobId));
    expect(job).toMatchObject({ status: "failed", retryable: false, errorCode: "WORKER_LEASE_EXHAUSTED" });
  });

  test("the watchdog ignores a healthy running lease", async () => {
    const { t, jobId } = await seedJob({ status: "running", attempt: 1, workerId: "healthy-worker", leaseExpiresAt: Date.now() + 600_000 });
    const result = await t.mutation(internal.renderJobs.watchdog, {});
    expect(result.stale).toBe(0);
    expect((await t.run((ctx) => ctx.db.get(jobId)))?.status).toBe("running");
  });

  test("a failed job from an older workflow cannot fail an active retry", async () => {
    const { t, projectId, videoId, jobId } = await seedJob({ status: "complete", completedAttempt: 1 });
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.patch(jobId, { appliedAt: now });
      await ctx.db.insert("renderJobs", {
        projectId,
        videoId,
        type: "ingest",
        status: "failed",
        progress: 20,
        workflowId: "workflow:older-attempt",
        attempt: 3,
        retryable: false,
        errorMessage: "Old terminal failure",
        createdAt: now - 10_000,
        updatedAt: now - 10_000,
      });
    });
    await t.mutation(internal.renderJobs.watchdog, {});
    expect((await t.run((ctx) => ctx.db.get(projectId)))?.status).toBe("processing");
  });
});

describe("callback and output idempotency", () => {
  test("a transient failure requeues once and a repeated callback is harmless", async () => {
    const { t, jobId, workflowId } = await seedJob({ status: "running", attempt: 1, workerId: "worker-a", leaseExpiresAt: Date.now() + 600_000 });
    const args = { jobId, workflowId, workerId: "worker-a", attempt: 1, result: { ok: false, errorMessage: "HTTP 503", errorCode: "TRANSCRIPTION_UNAVAILABLE", retryable: true } };
    expect((await t.mutation(internal.renderJobs.completeFromWorker, args)).disposition).toBe("requeued");
    expect((await t.mutation(internal.renderJobs.completeFromWorker, args)).disposition).toBe("stale");
    expect((await t.run((ctx) => ctx.db.get(jobId)))?.status).toBe("queued");
  });

  test("an old attempt cannot complete a newer lease", async () => {
    const { t, jobId, workflowId } = await seedJob({ status: "running", attempt: 2, workerId: "worker-b", leaseExpiresAt: Date.now() + 600_000 });
    const result = await t.mutation(internal.renderJobs.completeFromWorker, { jobId, workflowId, workerId: "worker-a", attempt: 1, result: { ok: true } });
    expect(result.disposition).toBe("stale");
    expect((await t.run((ctx) => ctx.db.get(jobId)))?.workerId).toBe("worker-b");
  });

  test("a duplicate success callback is a no-op", async () => {
    const { t, jobId, workflowId } = await seedJob({ status: "running", attempt: 1, workerId: "worker-a", leaseExpiresAt: Date.now() + 600_000 });
    const args = { jobId, workflowId, workerId: "worker-a", attempt: 1, result: { ok: true } };
    expect((await t.mutation(internal.renderJobs.completeFromWorker, args)).disposition).toBe("applied");
    expect((await t.mutation(internal.renderJobs.completeFromWorker, args)).disposition).toBe("duplicate");
  });

  test("ingest output and source-minute charging apply exactly once", async () => {
    const { t, userId, projectId, videoId, jobId } = await seedJob({ status: "complete", completedAttempt: 1 });
    const outputs = {
      durationSec: 3_601,
      width: 1920,
      height: 1080,
      fps: 30,
      proxyObjectKey: `${userId}/projects/${projectId}/proxy/source.mp4`,
      audioObjectKey: `${userId}/projects/${projectId}/audio/source.wav`,
    };
    const args = { jobId, projectId, videoId, stage: "ingest" as const, outputs };
    await t.mutation(internal.renderJobs.applyStageOutputs, args);
    await t.mutation(internal.renderJobs.applyStageOutputs, args);
    const state = await t.run(async (ctx) => ({
      user: await ctx.db.get(userId),
      ledger: await ctx.db.query("usageLedger").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).collect(),
    }));
    expect(state.user?.creditsRemaining).toBe(539);
    expect(state.ledger).toHaveLength(1);
    expect(state.ledger[0]?.idempotencyKey).toBe(`processing:${projectId}:source-minutes`);
  });

  test("transcript output is not inserted twice", async () => {
    const { t, projectId, videoId, jobId } = await seedJob({ status: "complete", stage: "transcribe", completedAttempt: 1 });
    const args = { jobId, projectId, videoId, stage: "transcribe" as const, outputs: { fullText: "Hello", segments: [{ startSec: 0, endSec: 1, text: "Hello" }], engine: "fake" } };
    await t.mutation(internal.renderJobs.applyStageOutputs, args);
    await t.run((ctx) => ctx.db.patch(jobId, { appliedAt: undefined }));
    await t.mutation(internal.renderJobs.applyStageOutputs, args);
    const transcripts = await t.run((ctx) => ctx.db.query("transcripts").withIndex("by_renderJobId", (q) => q.eq("renderJobId", jobId)).collect());
    expect(transcripts).toHaveLength(1);
  });

  test("an output-application failure turns an unapplied completion into a failed stage", async () => {
    const { t, jobId } = await seedJob({ status: "complete", completedAttempt: 1 });
    await t.mutation(internal.renderJobs.fail, {
      jobId,
      errorMessage: "Applying outputs failed",
      errorCode: "WORKFLOW_STAGE_FAILED",
      retryable: false,
    });
    expect(await t.run((ctx) => ctx.db.get(jobId))).toMatchObject({ status: "failed", errorCode: "WORKFLOW_STAGE_FAILED" });
  });
});

describe("project retry and abuse boundaries", () => {
  test("a failed project resumes from the first incomplete stage", async () => {
    const jobs = ["ingest", "transcribe", "analyse", "scene_detect"].map((type) => ({
      type: type as "ingest" | "transcribe" | "analyse" | "scene_detect",
      status: "complete",
      appliedAt: Date.now(),
    }));
    expect(resumeStageForHistory(jobs)).toBe("face_track");
  });

  test("a failed render workflow resumes from clips when stored media is available", async () => {
    const jobs = [
      { type: "ingest" as const, status: "failed" },
      ...["transcribe", "analyse", "scene_detect", "face_track", "caption_render"].map((type) => ({
        type: type as "transcribe" | "analyse" | "scene_detect" | "face_track" | "caption_render",
        status: "complete",
        appliedAt: Date.now(),
      })),
    ];
    expect(resumeStageForHistory(jobs, { hasStoredSource: true, hasClips: true })).toBe("clip_render");
  });

  test("another user cannot retry a failed project", async () => {
    const { t, projectId } = await seedJob({ status: "failed", stage: "face_track", attempt: 3 });
    const otherUserId = await t.run((ctx) => ctx.db.insert("users", {
      name: "Other User",
      email: "other@example.com",
      plan: "creator",
      creditsRemaining: 600,
      creditsUsedThisPeriod: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));
    await expect(t.withIdentity({ subject: otherUserId }).mutation(api.projects.retryFailedProject, { projectId })).rejects.toThrow("Project not found");
  });

  test("source object namespaces and concurrent project limits are enforced", async () => {
    const { t, userId } = await seedJob();
    const asUser = t.withIdentity({ subject: userId });
    await expect(asUser.mutation(api.projects.createUploadIntent, {
      objectKey: "another-user/sources/source.mp4",
      sourceFilename: "source.mp4",
      mimeType: "video/mp4",
      fileSizeBytes: 1_000,
    })).rejects.toThrow("does not belong");
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let index = 0; index < 2; index += 1) {
        await ctx.db.insert("projects", { userId, title: `Extra ${index}`, sourceType: "youtube", status: "processing", progress: 1, createdAt: now + index, updatedAt: now + index });
      }
    });
    await expect(asUser.mutation(api.projects.createFromYoutube, { title: "Blocked", youtubeUrl: "https://youtu.be/abcdefghijk" })).rejects.toThrow("projects can process at once");
  });
});

describe("billing replay protection", () => {
  test("a Stripe event changes plan and allocates credits only once", async () => {
    const previousSecret = process.env.STRIPE_WEBHOOK_FORWARDING_SECRET;
    process.env.STRIPE_WEBHOOK_FORWARDING_SECRET = "test-forwarding-secret";
    try {
      const t = convexTest(schema, modules);
      const userId = await t.run((ctx) => ctx.db.insert("users", {
        name: "Billing Test",
        email: "billing@example.com",
        stripeCustomerId: "cus_reliability",
        plan: "free",
        creditsRemaining: 30,
        creditsUsedThisPeriod: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));
      const args = {
        forwardingSecret: "test-forwarding-secret",
        eventId: "evt_reliability",
        eventType: "customer.subscription.created",
        stripeCustomerId: "cus_reliability",
        stripeSubscriptionId: "sub_reliability",
        subscriptionStatus: "active",
        plan: "creator" as const,
      };
      await t.mutation(api.billing.syncSubscription, args);
      await t.mutation(api.billing.syncSubscription, args);
      const state = await t.run(async (ctx) => ({
        user: await ctx.db.get(userId),
        events: await ctx.db.query("billingEvents").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).collect(),
        ledger: await ctx.db.query("usageLedger").withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", `stripe:${args.eventId}:allocation`)).collect(),
      }));
      expect(state.user).toMatchObject({ plan: "creator", creditsRemaining: 600 });
      expect(state.events).toHaveLength(1);
      expect(state.ledger).toHaveLength(1);
    } finally {
      if (previousSecret === undefined) delete process.env.STRIPE_WEBHOOK_FORWARDING_SECRET;
      else process.env.STRIPE_WEBHOOK_FORWARDING_SECRET = previousSecret;
    }
  });
});
