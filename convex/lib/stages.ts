import { v } from "convex/values";

export const stageNameValidator = v.union(
  v.literal("ingest"), v.literal("transcribe"), v.literal("analyse"), v.literal("scene_detect"),
  v.literal("face_track"), v.literal("caption_render"), v.literal("clip_render"), v.literal("thumbnail_render"),
);

export const mediaSegmentValidator = v.object({ startSec: v.number(), endSec: v.number(), text: v.string(), speaker: v.optional(v.string()) });
export const mediaWordValidator = v.object({ startSec: v.number(), endSec: v.number(), text: v.string(), confidence: v.optional(v.number()) });
export const cropStrategyValidator = v.union(
  v.literal("face_track"),
  v.literal("static_face"),
  v.literal("source_center"),
  v.literal("scene_aware_center"),
  v.literal("safe_center"),
);
export const cropTrackPointValidator = v.object({
  startSec: v.number(),
  endSec: v.number(),
  focusX: v.number(),
  focusY: v.number(),
  confidence: v.number(),
  subjectId: v.optional(v.string()),
  faceArea: v.optional(v.number()),
});
export const cropTrackValidator = v.object({
  clipId: v.string(),
  timebase: v.literal("absolute-video-seconds"),
  coordinateSpace: v.literal("normalized"),
  subjectId: v.optional(v.string()),
  tracks: v.array(cropTrackPointValidator),
});
export const captionTimingStrategyValidator = v.union(v.literal("word"), v.literal("segment"), v.literal("estimated"));
export const captionTimingValidator = v.object({
  clipId: v.string(),
  timingStrategy: captionTimingStrategyValidator,
  phraseCount: v.number(),
  wordHighlighting: v.boolean(),
});
export const sceneIntervalValidator = v.object({
  startSec: v.number(),
  endSec: v.number(),
  durationSec: v.number(),
  representativeSec: v.number(),
});
export const renderStatValidator = v.object({
  clipId: v.string(),
  cropStrategy: cropStrategyValidator,
  cropKeyframeCount: v.number(),
  captionTimingStrategy: v.union(captionTimingStrategyValidator, v.null()),
  captionPhraseCount: v.union(v.number(), v.null()),
  renderDurationMs: v.number(),
  sourceWidth: v.number(),
  sourceHeight: v.number(),
  outputWidth: v.number(),
  outputHeight: v.number(),
});
export const stageMetadataValidator = v.object({
  cropStrategy: v.optional(cropStrategyValidator),
  fallbackReason: v.optional(v.string()),
  tracker: v.optional(v.string()),
  cropTracks: v.optional(v.array(cropTrackValidator)),
  sceneTimestamps: v.optional(v.array(v.number())),
  sceneIntervals: v.optional(v.array(sceneIntervalValidator)),
  threshold: v.optional(v.number()),
  minimumSceneGapSec: v.optional(v.number()),
  captionObjectKeys: v.optional(v.array(v.string())),
  captionTiming: v.optional(v.array(captionTimingValidator)),
  renderStats: v.optional(v.array(renderStatValidator)),
});
export const clipAssetValidator = v.object({
  clipId: v.string(),
  previewUrl: v.optional(v.string()),
  finalUrl: v.optional(v.string()),
  thumbnailUrl: v.optional(v.string()),
  previewObjectKey: v.optional(v.string()),
  finalObjectKey: v.optional(v.string()),
  thumbnailObjectKey: v.optional(v.string()),
});

export const stageOutputsValidator = v.object({
  durationSec: v.optional(v.number()),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  fps: v.optional(v.number()),
  proxyUrl: v.optional(v.string()),
  audioUrl: v.optional(v.string()),
  proxyObjectKey: v.optional(v.string()),
  audioObjectKey: v.optional(v.string()),
  language: v.optional(v.string()),
  fullText: v.optional(v.string()),
  segments: v.optional(v.array(mediaSegmentValidator)),
  words: v.optional(v.array(mediaWordValidator)),
  engine: v.optional(v.string()),
  clipAssets: v.optional(v.array(clipAssetValidator)),
  metadata: v.optional(stageMetadataValidator),
});

export const stageResultValidator = v.object({
  ok: v.boolean(),
  outputs: v.optional(stageOutputsValidator),
  errorMessage: v.optional(v.string()),
  errorCode: v.optional(v.string()),
  retryable: v.optional(v.boolean()),
});

export const renderJobMetadataValidator = v.union(
  v.object({ candidateCount: v.number() }),
  stageOutputsValidator,
);
