import { z } from "zod";

export const stageSchema = z.enum(["ingest", "transcribe", "scene_detect", "face_track", "caption_render", "clip_render", "thumbnail_render"]);

export const jobSchema = z.object({
  jobId: z.string().min(1), projectId: z.string().min(1), videoId: z.string().min(1), stage: stageSchema,
  workflowId: z.string().min(1), eventName: z.string().min(1), callbackUrl: z.string().url(), callbackSecret: z.string().min(16),
  sourceType: z.enum(["upload", "youtube"]), originalUrl: z.string().url().nullable(), originalObjectKey: z.string().nullable(),
  proxyObjectKey: z.string().nullable(), audioObjectKey: z.string().nullable(), outputPrefix: z.string().min(1),
  clips: z.array(z.object({ id: z.string(), startSec: z.number().nonnegative(), endSec: z.number().positive(), captionPresetKey: z.string(), transcriptExcerpt: z.string() })).max(20),
});

export type WorkerJob = z.infer<typeof jobSchema>;
export type StageOutputs = {
  durationSec?: number; width?: number; height?: number; fps?: number;
  proxyUrl?: string; audioUrl?: string; proxyObjectKey?: string; audioObjectKey?: string;
  language?: string; fullText?: string; engine?: string;
  segments?: Array<{ startSec: number; endSec: number; text: string; speaker?: string }>;
  words?: Array<{ startSec: number; endSec: number; text: string; confidence?: number }>;
  clipAssets?: Array<{ clipId: string; previewUrl?: string; finalUrl?: string; thumbnailUrl?: string; previewObjectKey?: string; finalObjectKey?: string; thumbnailObjectKey?: string }>;
  metadata?: unknown;
};
