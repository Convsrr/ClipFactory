import type { WorkerConfig } from "./config.js";

export type WorkerCapabilities = {
  ffmpeg: boolean;
  ffprobe: boolean;
  subtitles: boolean;
  ytdlp: boolean;
  storage: boolean;
  transcription: boolean;
  faceTracker: boolean;
};

export const CAPABILITY_REQUIREMENTS = {
  required: ["ffmpeg", "ffprobe", "subtitles", "storage", "transcription"],
  optional: ["ytdlp", "faceTracker"],
} as const;

export function requiredCapabilitiesReady(capabilities: WorkerCapabilities) {
  return capabilities.ffmpeg
    && capabilities.ffprobe
    && capabilities.subtitles
    && capabilities.storage
    && capabilities.transcription;
}

export function buildHealthResponse(input: {
  config: WorkerConfig;
  capabilities: WorkerCapabilities;
  activeJobs: number;
  startedAt: number;
  lastSuccessfulJobAt: number | null;
  lastFailedJobAt: number | null;
  now?: number;
}) {
  const ok = requiredCapabilitiesReady(input.capabilities);
  return {
    ok,
    workerId: input.config.workerId,
    activeJobs: input.activeJobs,
    capacity: input.config.maxParallel,
    version: input.config.version,
    uptimeSec: Math.floor(((input.now ?? Date.now()) - input.startedAt) / 1000),
    lastSuccessfulJobAt: input.lastSuccessfulJobAt,
    lastFailedJobAt: input.lastFailedJobAt,
    capabilities: input.capabilities,
    capabilityRequirements: CAPABILITY_REQUIREMENTS,
  };
}
