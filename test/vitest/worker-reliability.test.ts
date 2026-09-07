import { describe, expect, test, vi } from "vitest";
import { deliverCallback, shouldRetryHttpStatus } from "../../worker/src/control-plane";
import { classifyWorkerError, WorkerError } from "../../worker/src/errors";
import { jobSchema } from "../../worker/src/types";
import { buildHealthResponse } from "../../worker/src/health";

const config = {
  port: 8788,
  workerId: "worker-test",
  maxParallel: 2,
  heartbeatMs: 30_000,
  pollMs: 2_000,
  callbackMaxAttempts: 3,
  requestTimeoutMs: 30_000,
  controlBaseUrl: "https://convex.example",
  sharedSecret: "shared-secret-value",
  callbackSecret: "callback-secret-value",
  version: "test",
};
const job = { jobId: "job-1", workflowId: "workflow-1", attempt: 1, projectId: "project-1", stage: "transcribe" as const };

describe("callback delivery", () => {
  test("500 responses are retried and eventually succeed", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const result = await deliverCallback(config, job, { ok: true }, fetcher, async () => undefined);
    expect(result).toMatchObject({ delivered: true, attempts: 2 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test("400 responses are not retried", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 400 }));
    const result = await deliverCallback(config, job, { ok: true }, fetcher, async () => undefined);
    expect(result).toMatchObject({ delivered: false, status: 400, attempts: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test("retryable status policy is bounded to transient HTTP failures", () => {
    expect([408, 429, 500, 503].every(shouldRetryHttpStatus)).toBe(true);
    expect([400, 401, 404, 409].some(shouldRetryHttpStatus)).toBe(false);
  });
});

describe("worker error and payload safety", () => {
  test("invalid media is permanent while transient provider failures retry", () => {
    expect(classifyWorkerError(new WorkerError("INVALID_MEDIA", "corrupt input", false))).toMatchObject({ code: "INVALID_MEDIA", retryable: false });
    expect(classifyWorkerError(new Error("Transcription HTTP 503"))).toMatchObject({ retryable: true });
  });

  test("job payloads reject object-key traversal", () => {
    const parsed = jobSchema.safeParse({
      ...job,
      videoId: "video-1",
      sourceType: "upload",
      originalUrl: null,
      originalObjectKey: "user/sources/../secret",
      proxyObjectKey: null,
      audioObjectKey: null,
      outputPrefix: "user/projects/project-1",
      sourceWidth: null,
      sourceHeight: null,
      sourceFps: null,
      sourceFileSizeBytes: 100,
      maxSourceFileBytes: 1_000,
      maxSourceDurationSec: 60,
      sceneTimestamps: [],
      clips: [],
    });
    expect(parsed.success).toBe(false);
  });

  test("health output reports capabilities without exposing secrets", () => {
    const health = buildHealthResponse({
      config,
      capabilities: { ffmpeg: true, ffprobe: true, subtitles: true, ytdlp: false, storage: true, transcription: true, faceTracker: false },
      activeJobs: 1,
      startedAt: 1_000,
      now: 6_000,
      lastSuccessfulJobAt: null,
      lastFailedJobAt: null,
    });
    expect(health).toMatchObject({ ok: true, workerId: "worker-test", activeJobs: 1, capacity: 2, uptimeSec: 5 });
    expect(JSON.stringify(health)).not.toContain(config.sharedSecret);
    expect(JSON.stringify(health)).not.toContain(config.callbackSecret);
  });
});
