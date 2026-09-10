export const PROCESSING_STAGES = [
  "ingest",
  "transcribe",
  "analyse",
  "scene_detect",
  "face_track",
  "caption_render",
  "clip_render",
  "thumbnail_render",
] as const;

export type ProcessingStage = (typeof PROCESSING_STAGES)[number];

export const RELIABILITY_DEFAULTS = {
  workerLeaseMs: 10 * 60 * 1000,
  workerHeartbeatMs: 30 * 1000,
  workerPollMs: 2 * 1000,
  workerMaxAttempts: 3,
  callbackMaxAttempts: 5,
  callbackInitialBackoffMs: 1_000,
  retryInitialBackoffMs: 30 * 1000,
  retryMaximumBackoffMs: 15 * 60 * 1000,
  staleTempDirectoryMs: 24 * 60 * 60 * 1000,
} as const;

export const PRODUCT_LIMITS = {
  maxSourceFileBytes: 5 * 1024 * 1024 * 1024,
  maxRemoteSourceFileBytes: 25 * 1024 * 1024 * 1024,
  maxSourceDurationSec: 3 * 60 * 60,
  maxConcurrentProjectsPerUser: 3,
  uploadIntentTtlMs: 24 * 60 * 60 * 1000,
} as const;

export function retryBackoffMs(attempt: number) {
  const exponent = Math.max(0, Math.floor(attempt) - 1);
  return Math.min(
    RELIABILITY_DEFAULTS.retryMaximumBackoffMs,
    RELIABILITY_DEFAULTS.retryInitialBackoffMs * (2 ** exponent),
  );
}

export function callbackBackoffMs(attempt: number) {
  return Math.min(30_000, RELIABILITY_DEFAULTS.callbackInitialBackoffMs * (2 ** Math.max(0, attempt - 1)));
}

export function stageIndex(stage: ProcessingStage) {
  return PROCESSING_STAGES.indexOf(stage);
}

export function progressAfterStage(stage: ProcessingStage) {
  return Math.round(((stageIndex(stage) + 1) / PROCESSING_STAGES.length) * 100);
}

export function nextStage(stage: ProcessingStage): ProcessingStage | null {
  return PROCESSING_STAGES[stageIndex(stage) + 1] ?? null;
}

export function resumeStageForHistory(
  jobs: ReadonlyArray<{ type: ProcessingStage; status: string; appliedAt?: number }>,
  options: { hasStoredSource?: boolean; hasClips?: boolean } = {},
): ProcessingStage {
  const firstIncomplete = PROCESSING_STAGES.find((stage) => !jobs.some((job) => job.type === stage && job.status === "complete" && job.appliedAt !== undefined));
  if (firstIncomplete === "ingest" && options.hasStoredSource && options.hasClips && jobs.some((job) => job.type === "caption_render" && job.status === "complete" && job.appliedAt !== undefined)) {
    return "clip_render";
  }
  return firstIncomplete
    ?? [...jobs].reverse().find((job) => job.status === "failed")?.type
    ?? "thumbnail_render";
}
