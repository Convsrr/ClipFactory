import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { RELIABILITY_DEFAULTS } from "../../shared/reliability.js";

export type WorkerConfig = ReturnType<typeof loadWorkerConfig>;

export function loadWorkerConfig() {
  for (const name of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "WHISPER_BASE_URL"]) requiredEnv(name);
  const workerId = process.env.WORKER_ID?.trim() || `${safeHost()}-${process.pid}-${randomUUID().slice(0, 8)}`;
  if (!/^[a-zA-Z0-9._:-]{1,120}$/.test(workerId)) throw new Error("WORKER_ID must contain only letters, numbers, dot, underscore, colon, or hyphen");
  const controlBaseUrl = webUrl(requiredEnv("CONVEX_SITE_URL"), "CONVEX_SITE_URL");
  const sharedSecret = requiredEnv("WORKER_SHARED_SECRET");
  const callbackSecret = requiredEnv("WORKER_CALLBACK_SECRET");
  if (sharedSecret.length < 16 || callbackSecret.length < 16) throw new Error("Worker secrets must contain at least 16 characters");
  return {
    port: boundedNumber("WORKER_PORT", 8788, 1, 65_535),
    workerId,
    maxParallel: boundedNumber("WORKER_MAX_PARALLEL", 2, 1, 16),
    heartbeatMs: boundedNumber("WORKER_HEARTBEAT_MS", RELIABILITY_DEFAULTS.workerHeartbeatMs, 10_000, 60_000),
    pollMs: boundedNumber("WORKER_POLL_MS", RELIABILITY_DEFAULTS.workerPollMs, 500, 60_000),
    callbackMaxAttempts: boundedNumber("WORKER_CALLBACK_MAX_ATTEMPTS", RELIABILITY_DEFAULTS.callbackMaxAttempts, 1, 10),
    requestTimeoutMs: boundedNumber("WORKER_CONTROL_TIMEOUT_MS", 30_000, 5_000, 120_000),
    controlBaseUrl: controlBaseUrl.replace(/\/$/, ""),
    sharedSecret,
    callbackSecret,
    version: (process.env.RELEASE_SHA || process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || "development").slice(0, 64),
  };
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function boundedNumber(name: string, fallback: number, minimum: number, maximum: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  return Math.round(parsed);
}

function webUrl(value: string, name: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1"))) {
    throw new Error(`${name} must be HTTPS outside local development`);
  }
  return url.toString();
}

function safeHost() {
  return hostname().replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 48) || "worker";
}
