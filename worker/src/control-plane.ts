import { callbackBackoffMs } from "../../shared/reliability.js";
import type { WorkerConfig } from "./config.js";
import { WorkerError } from "./errors.js";
import { jobSchema, type WorkerCallbackResult, type WorkerJob } from "./types.js";

type Fetcher = typeof fetch;

export async function claimJob(config: WorkerConfig, fetcher: Fetcher = fetch): Promise<WorkerJob | null> {
  const response = await postJson(fetcher, `${config.controlBaseUrl}/worker/claim`, config.sharedSecret, { workerId: config.workerId }, config.requestTimeoutMs);
  if (!response.ok) throw new Error(`Claim request returned HTTP ${response.status}`);
  const body = await response.json() as { job?: unknown };
  if (!body.job) return null;
  return jobSchema.parse(body.job);
}

export async function sendHeartbeat(
  config: WorkerConfig,
  job: Pick<WorkerJob, "jobId" | "attempt">,
  progress: number,
  fetcher: Fetcher = fetch,
) {
  const response = await postJson(fetcher, `${config.controlBaseUrl}/worker/heartbeat`, config.sharedSecret, {
    jobId: job.jobId,
    workerId: config.workerId,
    attempt: job.attempt,
    progress,
  }, config.requestTimeoutMs);
  if (response.status === 409) throw new WorkerError("LEASE_LOST", "Worker lease is no longer active", false);
  if (!response.ok) throw new Error(`Heartbeat returned HTTP ${response.status}`);
  const body = await response.json() as { accepted?: boolean };
  if (!body.accepted) throw new WorkerError("LEASE_LOST", "Worker lease is no longer active", false);
}

export async function deliverCallback(
  config: WorkerConfig,
  job: Pick<WorkerJob, "jobId" | "workflowId" | "attempt" | "projectId" | "stage">,
  result: WorkerCallbackResult,
  fetcher: Fetcher = fetch,
  wait: (milliseconds: number) => Promise<void> = sleep,
) {
  let lastStatus: number | null = null;
  for (let deliveryAttempt = 1; deliveryAttempt <= config.callbackMaxAttempts; deliveryAttempt += 1) {
    try {
      const response = await postJson(fetcher, `${config.controlBaseUrl}/worker/callback`, config.callbackSecret, {
        jobId: job.jobId,
        workflowId: job.workflowId,
        workerId: config.workerId,
        attempt: job.attempt,
        result,
      }, config.requestTimeoutMs);
      lastStatus = response.status;
      if (response.ok) return { delivered: true, status: response.status, attempts: deliveryAttempt };
      if (!shouldRetryHttpStatus(response.status)) {
        return { delivered: false, status: response.status, attempts: deliveryAttempt };
      }
    } catch {
      if (deliveryAttempt === config.callbackMaxAttempts) break;
      console.warn(JSON.stringify({ event: "worker.callback_retry", workerId: config.workerId, jobId: job.jobId, projectId: job.projectId, stage: job.stage, attempt: job.attempt, deliveryAttempt, errorClass: "CALLBACK_NETWORK_ERROR" }));
    }
    if (deliveryAttempt < config.callbackMaxAttempts) {
      const delayMs = callbackBackoffMs(deliveryAttempt);
      console.warn(JSON.stringify({ event: "worker.callback_retry", workerId: config.workerId, jobId: job.jobId, projectId: job.projectId, stage: job.stage, attempt: job.attempt, deliveryAttempt, status: lastStatus, delayMs }));
      await wait(delayMs);
    }
  }
  return { delivered: false, status: lastStatus, attempts: config.callbackMaxAttempts };
}

export function shouldRetryHttpStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

async function postJson(fetcher: Fetcher, url: string, secret: string, body: unknown, timeoutMs: number) {
  return fetcher(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

function sleep(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
