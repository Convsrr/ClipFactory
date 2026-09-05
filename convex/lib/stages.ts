import { v } from "convex/values";

export const stageNameValidator = v.union(
  v.literal("ingest"), v.literal("transcribe"), v.literal("analyse"), v.literal("scene_detect"),
  v.literal("face_track"), v.literal("caption_render"), v.literal("clip_render"), v.literal("thumbnail_render"),
);

export const mediaSegmentValidator = v.object({ startSec: v.number(), endSec: v.number(), text: v.string(), speaker: v.optional(v.string()) });
export const mediaWordValidator = v.object({ startSec: v.number(), endSec: v.number(), text: v.string(), confidence: v.optional(v.number()) });
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
  metadata: v.optional(v.any()),
});

export const stageResultValidator = v.object({
  ok: v.boolean(),
  outputs: v.optional(stageOutputsValidator),
  errorMessage: v.optional(v.string()),
});
