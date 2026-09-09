export type WorkerErrorCode =
  | "INVALID_MEDIA"
  | "SOURCE_UNAVAILABLE"
  | "INVALID_JOB_PAYLOAD"
  | "CONFIGURATION_ERROR"
  | "TRANSCRIPTION_RATE_LIMITED"
  | "TRANSCRIPTION_UNAVAILABLE"
  | "STORAGE_UNAVAILABLE"
  | "CALLBACK_DELIVERY_FAILED"
  | "LEASE_LOST"
  | "WORKER_STAGE_FAILED";

export class WorkerError extends Error {
  constructor(
    public readonly code: WorkerErrorCode,
    message: string,
    public readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "WorkerError";
  }
}

export function classifyWorkerError(error: unknown) {
  if (error instanceof WorkerError) return { code: error.code, retryable: error.retryable, message: safeMessage(error.message) };
  const message = error instanceof Error ? error.message : "Worker stage failed";
  const normalized = message.toLowerCase();
  if (normalized.includes("is not configured") || normalized.includes("unauthorized") || normalized.includes("authentication")) {
    return { code: "CONFIGURATION_ERROR" as const, retryable: false, message: safeMessage(message) };
  }
  if (normalized.includes("no video stream") || normalized.includes("invalid media") || normalized.includes("unsupported codec") || normalized.includes("corrupt") || normalized.includes("malformed") || normalized.includes("ffprobe")) {
    return { code: "INVALID_MEDIA" as const, retryable: false, message: safeMessage(message) };
  }
  if (normalized.includes("http 429") || normalized.includes("status code: 429")) {
    return { code: "TRANSCRIPTION_RATE_LIMITED" as const, retryable: true, message: safeMessage(message) };
  }
  if (/http 5\d\d/.test(normalized) || normalized.includes("timeout") || normalized.includes("timed out") || normalized.includes("econn") || normalized.includes("fetch failed")) {
    return { code: "TRANSCRIPTION_UNAVAILABLE" as const, retryable: true, message: safeMessage(message) };
  }
  if (normalized.includes("object") || normalized.includes("s3") || normalized.includes("r2") || normalized.includes("storage")) {
    return { code: "STORAGE_UNAVAILABLE" as const, retryable: true, message: safeMessage(message) };
  }
  return { code: "WORKER_STAGE_FAILED" as const, retryable: true, message: safeMessage(message) };
}

function safeMessage(message: string) {
  return message.replace(/https?:\/\/\S+/g, "[url removed]").slice(0, 500);
}
