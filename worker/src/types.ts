import { z } from "zod";
import {
  captionPresetKeySchema,
  captionTimingStrategySchema,
  cropTrackSchema,
  transcriptSegmentSchema,
  transcriptWordSchema,
  type CaptionTimingSummary,
  type CropTrack,
  type CropStrategy,
  type RenderStat,
} from "./media-types.js";

export const stageSchema = z.enum(["ingest", "transcribe", "scene_detect", "face_track", "caption_render", "clip_render", "thumbnail_render"]);

const workerClipSchema = z.object({
  id: z.string().min(1),
  startSec: z.number().finite().nonnegative(),
  endSec: z.number().finite().positive(),
  captionPresetKey: captionPresetKeySchema,
  transcriptExcerpt: z.string(),
  /** Transcript timings remain in absolute source-video seconds until caption generation. */
  transcriptSegments: z.array(transcriptSegmentSchema).default([]),
  transcriptWords: z.array(transcriptWordSchema).default([]),
  cropTrack: cropTrackSchema.nullable().default(null),
  captionTimingStrategy: captionTimingStrategySchema.nullable().default(null),
  captionPhraseCount: z.number().int().nonnegative().nullable().default(null),
}).refine((value) => value.endSec > value.startSec, { message: "Clip endSec must be greater than startSec" });

export type WorkerClip = z.infer<typeof workerClipSchema>;

export const jobSchema = z.object({
  jobId: z.string().min(1),
  projectId: z.string().min(1),
  videoId: z.string().min(1),
  stage: stageSchema,
  workflowId: z.string().min(1),
  attempt: z.number().int().positive(),
  sourceType: z.enum(["upload", "youtube"]),
  originalUrl: z.string().url().nullable(),
  originalObjectKey: z.string().nullable(),
  proxyObjectKey: z.string().nullable(),
  audioObjectKey: z.string().nullable(),
  outputPrefix: z.string().min(1),
  sourceWidth: z.number().int().positive().nullable(),
  sourceHeight: z.number().int().positive().nullable(),
  sourceFps: z.number().finite().positive().nullable(),
  sourceFileSizeBytes: z.number().int().positive().nullable(),
  maxSourceFileBytes: z.number().int().positive(),
  maxSourceDurationSec: z.number().finite().positive(),
  /** Scene timestamps use the same absolute source-video timebase as crop tracks. */
  sceneTimestamps: z.array(z.number().finite().nonnegative()),
  clips: z.array(workerClipSchema).max(20),
}).superRefine((value, context) => {
  const keys = [value.originalObjectKey, value.proxyObjectKey, value.audioObjectKey, value.outputPrefix].filter((key): key is string => Boolean(key));
  for (const key of keys) {
    if (key.startsWith("/") || key.includes("..") || key.includes("\\") || key.length > 800) {
      context.addIssue({ code: "custom", message: "Object key is invalid" });
    }
  }
  if (value.sourceType === "upload" && !value.originalObjectKey && value.stage === "ingest") {
    context.addIssue({ code: "custom", message: "Upload ingest requires an object key" });
  }
});

export type WorkerJob = z.infer<typeof jobSchema>;

export type WorkerCallbackResult = {
  ok: boolean;
  outputs?: StageOutputs;
  errorMessage?: string;
  errorCode?: string;
  retryable?: boolean;
};

export type StageMetadata = {
  cropStrategy?: CropStrategy;
  fallbackReason?: string;
  tracker?: string;
  cropTracks?: CropTrack[];
  sceneTimestamps?: number[];
  threshold?: number;
  captionObjectKeys?: string[];
  captionTiming?: CaptionTimingSummary[];
  renderStats?: RenderStat[];
};

export type StageOutputs = {
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
  engine?: string;
  segments?: Array<{ startSec: number; endSec: number; text: string; speaker?: string }>;
  words?: Array<{ startSec: number; endSec: number; text: string; confidence?: number }>;
  clipAssets?: Array<{ clipId: string; previewUrl?: string; finalUrl?: string; thumbnailUrl?: string; previewObjectKey?: string; finalObjectKey?: string; thumbnailObjectKey?: string }>;
  metadata?: StageMetadata;
};
