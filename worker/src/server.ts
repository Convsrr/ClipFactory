import { createServer } from "node:http";
import { checkMediaCapabilities } from "./ffmpeg.js";
import { classifyWorkerError } from "./errors.js";
import { loadWorkerConfig } from "./config.js";
import { claimJob, deliverCallback, sendHeartbeat } from "./control-plane.js";
import { processJob } from "./pipeline.js";
import { storageConfigured } from "./storage.js";
import { cleanupStaleWorkerDirectories } from "./temp-cleanup.js";
import { transcriptionConfigured } from "./transcription.js";
import { loadWorkerEnv } from "./env.js";
import type { WorkerJob } from "./types.js";
import { buildHealthResponse, requiredCapabilitiesReady } from "./health.js";

type ActiveJob = { job: WorkerJob; progress: number; startedAt: number; leaseLost: boolean };

async function main() {
  loadWorkerEnv();
  const config = loadWorkerConfig();
  const startedAt = Date.now();
  const activeJobs = new Map<string, ActiveJob>();
  const capabilities = {
    ...(await checkMediaCapabilities()),
    storage: storageConfigured(),
    transcription: transcriptionConfigured(),
    faceTracker: Boolean(process.env.FACE_TRACKER_URL?.trim()),
  };
  const readyToProcess = requiredCapabilitiesReady(capabilities);
  const removedTempDirectories = await cleanupStaleWorkerDirectories().catch(() => 0);
  let lastSuccessfulJobAt: number | null = null;
  let lastFailedJobAt: number | null = null;
  let polling = false;
  let shuttingDown = false;

  const server = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      const health = buildHealthResponse({
        config,
        capabilities,
        activeJobs: activeJobs.size,
        startedAt,
        lastSuccessfulJobAt,
        lastFailedJobAt,
      });
      return send(response, health.ok ? 200 : 503, health);
    }
    return send(response, 404, { error: "Not found" });
  });

  async function pollForWork() {
    if (!readyToProcess || polling || shuttingDown || activeJobs.size >= config.maxParallel) return;
    polling = true;
    try {
      while (!shuttingDown && activeJobs.size < config.maxParallel) {
        const job = await claimJob(config);
        if (!job) break;
        const state: ActiveJob = { job, progress: 2, startedAt: Date.now(), leaseLost: false };
        activeJobs.set(job.jobId, state);
        void runClaimedJob(state);
      }
    } catch (error) {
      const failure = classifyWorkerError(error);
      console.error(JSON.stringify({ event: "worker.claim_failed", workerId: config.workerId, errorClass: failure.code, status: "failed" }));
    } finally {
      polling = false;
    }
  }

  async function runClaimedJob(state: ActiveJob) {
    const { job } = state;
    console.info(JSON.stringify({ event: "worker.claimed_job", workerId: config.workerId, jobId: job.jobId, projectId: job.projectId, stage: job.stage, attempt: job.attempt }));
    const heartbeatTimer = setInterval(() => {
      void sendHeartbeat(config, job, state.progress).catch((error) => {
        const failure = classifyWorkerError(error);
        if (failure.code === "LEASE_LOST") state.leaseLost = true;
        console.warn(JSON.stringify({ event: "worker.heartbeat", workerId: config.workerId, jobId: job.jobId, projectId: job.projectId, stage: job.stage, attempt: job.attempt, status: "failed", errorClass: failure.code }));
      });
    }, config.heartbeatMs);

    try {
      const outputs = await processJob(job, (progress) => { state.progress = Math.max(state.progress, progress); });
      if (state.leaseLost) {
        console.warn(JSON.stringify({ event: "worker.callback_failed", workerId: config.workerId, jobId: job.jobId, projectId: job.projectId, stage: job.stage, attempt: job.attempt, errorClass: "LEASE_LOST" }));
        return;
      }
      const delivery = await deliverCallback(config, job, { ok: true, outputs });
      if (!delivery.delivered) {
        lastFailedJobAt = Date.now();
        console.error(JSON.stringify({ event: "worker.callback_failed", workerId: config.workerId, jobId: job.jobId, projectId: job.projectId, stage: job.stage, attempt: job.attempt, status: delivery.status, errorClass: "CALLBACK_DELIVERY_FAILED" }));
        return;
      }
      lastSuccessfulJobAt = Date.now();
      console.info(JSON.stringify({ event: "worker.completed_job", workerId: config.workerId, jobId: job.jobId, projectId: job.projectId, stage: job.stage, attempt: job.attempt, elapsedMs: Date.now() - state.startedAt, status: "complete" }));
    } catch (error) {
      const failure = classifyWorkerError(error);
      lastFailedJobAt = Date.now();
      if (!state.leaseLost) {
        const delivery = await deliverCallback(config, job, { ok: false, errorMessage: failure.message, errorCode: failure.code, retryable: failure.retryable });
        if (!delivery.delivered) {
          console.error(JSON.stringify({ event: "worker.callback_failed", workerId: config.workerId, jobId: job.jobId, projectId: job.projectId, stage: job.stage, attempt: job.attempt, status: delivery.status, errorClass: "CALLBACK_DELIVERY_FAILED" }));
        }
      }
      console.error(JSON.stringify({ event: "worker.failed_job", workerId: config.workerId, jobId: job.jobId, projectId: job.projectId, stage: job.stage, attempt: job.attempt, elapsedMs: Date.now() - state.startedAt, errorClass: failure.code, retryable: failure.retryable, status: "failed" }));
    } finally {
      clearInterval(heartbeatTimer);
      activeJobs.delete(job.jobId);
      void pollForWork();
    }
  }

  server.listen(config.port, () => {
    console.info(JSON.stringify({ event: "worker.started", workerId: config.workerId, capacity: config.maxParallel, version: config.version, readyToProcess, capabilities, removedTempDirectories }));
    void pollForWork();
  });

  const pollTimer = setInterval(() => { void pollForWork(); }, config.pollMs);
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(pollTimer);
    server.close();
    console.info(JSON.stringify({ event: "worker.stopping", workerId: config.workerId, activeJobs: activeJobs.size }));
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

function send(response: import("node:http").ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

main().catch((error) => {
  const failure = classifyWorkerError(error);
  console.error(JSON.stringify({ event: "worker.start_failed", errorClass: failure.code, message: failure.message }));
  process.exitCode = 1;
});
