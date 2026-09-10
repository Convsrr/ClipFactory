import { z } from "zod";

export const cropStrategySchema = z.enum([
  "face_track",
  "static_face",
  "source_center",
  "scene_aware_center",
  "safe_center",
]);

export type CropStrategy = z.infer<typeof cropStrategySchema>;

export const cropTrackPointSchema = z.object({
  startSec: z.number().finite().nonnegative(),
  endSec: z.number().finite().positive(),
  focusX: z.number().finite().min(0).max(1),
  focusY: z.number().finite().min(0).max(1),
  confidence: z.number().finite().min(0).max(1),
  subjectId: z.string().min(1).optional(),
  faceArea: z.number().finite().min(0).max(1).optional(),
}).refine((value) => value.endSec > value.startSec, { message: "Crop track endSec must be greater than startSec" });

export type CropTrackPoint = z.infer<typeof cropTrackPointSchema>;

/** Crop tracking is persisted in absolute source-video seconds and normalized 0..1 coordinates. */
export const cropTrackSchema = z.object({
  clipId: z.string().min(1),
  timebase: z.literal("absolute-video-seconds"),
  coordinateSpace: z.literal("normalized"),
  subjectId: z.string().min(1).optional(),
  tracks: z.array(cropTrackPointSchema).max(10_000),
});

export type CropTrack = z.infer<typeof cropTrackSchema>;

export const sceneIntervalSchema = z.object({
  startSec: z.number().finite().nonnegative(),
  endSec: z.number().finite().positive(),
  durationSec: z.number().finite().positive(),
  representativeSec: z.number().finite().nonnegative(),
}).refine((value) => value.endSec > value.startSec && value.durationSec > 0 && value.representativeSec >= value.startSec && value.representativeSec <= value.endSec, {
  message: "Scene interval bounds are invalid",
});

export type SceneInterval = z.infer<typeof sceneIntervalSchema>;

export const transcriptSegmentSchema = z.object({
  startSec: z.number().finite().nonnegative(),
  endSec: z.number().finite().positive(),
  text: z.string(),
  speaker: z.string().optional(),
}).refine((value) => value.endSec > value.startSec, { message: "Transcript segment endSec must be greater than startSec" });

export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;

export const transcriptWordSchema = z.object({
  startSec: z.number().finite().nonnegative(),
  endSec: z.number().finite().positive(),
  text: z.string(),
  confidence: z.number().finite().min(0).max(1).optional(),
}).refine((value) => value.endSec > value.startSec, { message: "Transcript word endSec must be greater than startSec" });

export type TranscriptWord = z.infer<typeof transcriptWordSchema>;

export const captionPresetKeySchema = z.enum(["bold-viral", "minimal-clean", "podcast"]);
export type CaptionPresetKey = z.infer<typeof captionPresetKeySchema>;

export const captionTimingStrategySchema = z.enum(["word", "segment", "estimated"]);
export type CaptionTimingStrategy = z.infer<typeof captionTimingStrategySchema>;

export type CaptionTimingSummary = {
  clipId: string;
  timingStrategy: CaptionTimingStrategy;
  phraseCount: number;
  wordHighlighting: boolean;
};

export type RenderStat = {
  clipId: string;
  cropStrategy: CropStrategy;
  cropKeyframeCount: number;
  captionTimingStrategy: CaptionTimingStrategy | null;
  captionPhraseCount: number | null;
  renderDurationMs: number;
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: 1080;
  outputHeight: 1920;
};
