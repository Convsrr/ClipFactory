import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { PRODUCT_LIMITS } from "../shared/reliability";
import { stageNameValidator, cropTrackValidator, mediaSegmentValidator, mediaWordValidator, captionTimingStrategyValidator, sceneIntervalValidator } from "./lib/stages";

type CropTrackPoint = {
  startSec: number;
  endSec: number;
  focusX: number;
  focusY: number;
  confidence: number;
  subjectId?: string;
  faceArea?: number;
};

type CropTrack = {
  clipId: string;
  timebase: "absolute-video-seconds";
  coordinateSpace: "normalized";
  subjectId?: string;
  tracks: CropTrackPoint[];
};

type SceneInterval = {
  startSec: number;
  endSec: number;
  durationSec: number;
  representativeSec: number;
};

export const payload = internalQuery({
  args: { jobId: v.id("renderJobs"), workerId: v.string(), attempt: v.number() },
  returns: v.object({
    jobId: v.string(), projectId: v.string(), videoId: v.string(), stage: stageNameValidator, workflowId: v.string(), attempt: v.number(),
    sourceType: v.union(v.literal("upload"), v.literal("youtube"), v.literal("google_drive")),
    originalUrl: v.union(v.string(), v.null()), originalObjectKey: v.union(v.string(), v.null()),
    proxyObjectKey: v.union(v.string(), v.null()), audioObjectKey: v.union(v.string(), v.null()), outputPrefix: v.string(),
    sourceWidth: v.union(v.number(), v.null()), sourceHeight: v.union(v.number(), v.null()), sourceFps: v.union(v.number(), v.null()),
    sourceFileSizeBytes: v.union(v.number(), v.null()), maxSourceFileBytes: v.number(), maxSourceDurationSec: v.number(),
    sceneTimestamps: v.array(v.number()),
    sceneIntervals: v.array(sceneIntervalValidator),
    clips: v.array(v.object({
      id: v.string(), startSec: v.number(), endSec: v.number(), captionPresetKey: v.string(), transcriptExcerpt: v.string(),
      transcriptSegments: v.array(mediaSegmentValidator), transcriptWords: v.array(mediaWordValidator),
      cropTrack: v.union(cropTrackValidator, v.null()),
      captionTimingStrategy: v.union(captionTimingStrategyValidator, v.null()),
      captionPhraseCount: v.union(v.number(), v.null()),
    })),
  }),
  handler: async (ctx, args) => {
    const claimedJob = await ctx.db.get(args.jobId);
    if (!claimedJob || claimedJob.status !== "running" || claimedJob.workerId !== args.workerId || claimedJob.attempt !== args.attempt || !claimedJob.videoId || !claimedJob.workflowId) {
      throw new Error("Worker claim is no longer valid");
    }
    const projectId = claimedJob.projectId;
    const videoId = claimedJob.videoId;
    const [job, project, video, clips, transcript, jobs] = await Promise.all([
      ctx.db.get(args.jobId),
      ctx.db.get(projectId),
      ctx.db.get(videoId),
      ctx.db.query("clips").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).take(20),
      ctx.db.query("transcripts").withIndex("by_videoId", (q) => q.eq("videoId", videoId)).order("desc").take(1),
      ctx.db.query("renderJobs").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).order("desc").take(64),
    ]);
    if (!job || !project || !video || job.projectId !== project._id || video.projectId !== project._id || !job.workflowId) throw new Error("Worker job payload is inconsistent");

    const latestSceneOutput = latestStageOutput(jobs, "scene_detect");
    const latestFaceOutput = latestStageOutput(jobs, "face_track");
    const latestCaptionOutput = latestStageOutput(jobs, "caption_render");
    const sceneTimestamps = readSceneTimestamps(latestSceneOutput);
    const sceneIntervals = readSceneIntervals(latestSceneOutput);
    const cropTracks = readCropTracks(latestFaceOutput);
    const captionTiming = readCaptionTiming(latestCaptionOutput);
    const currentTranscript = transcript[0];

    return {
      jobId: job._id as string,
      projectId: project._id as string,
      videoId: video._id as string,
      stage: job.type,
      workflowId: job.workflowId,
      attempt: args.attempt,
      sourceType: project.sourceType,
      originalUrl: video.originalUrl ?? null,
      originalObjectKey: video.originalObjectKey ?? null,
      proxyObjectKey: video.proxyObjectKey ?? null,
      audioObjectKey: video.audioObjectKey ?? null,
      outputPrefix: `${project.userId}/projects/${project._id}`,
      sourceWidth: video.width ?? null,
      sourceHeight: video.height ?? null,
      sourceFps: video.fps ?? null,
      sourceFileSizeBytes: video.fileSizeBytes ?? null,
      maxSourceFileBytes: project.sourceType === "google_drive" ? PRODUCT_LIMITS.maxRemoteSourceFileBytes : PRODUCT_LIMITS.maxSourceFileBytes,
      maxSourceDurationSec: PRODUCT_LIMITS.maxSourceDurationSec,
      sceneTimestamps,
      sceneIntervals,
      clips: clips.map((clip) => ({
        id: clip._id as string,
        startSec: clip.startSec,
        endSec: clip.endSec,
        captionPresetKey: clip.captionPresetKey,
        transcriptExcerpt: clip.transcriptExcerpt,
        transcriptSegments: (currentTranscript?.segments ?? []).filter((segment) => overlaps(segment.startSec, segment.endSec, clip.startSec, clip.endSec)),
        transcriptWords: (currentTranscript?.words ?? []).filter((word) => overlaps(word.startSec, word.endSec, clip.startSec, clip.endSec)),
        cropTrack: cropTracks.find((track) => track.clipId === (clip._id as string)) ?? null,
        captionTimingStrategy: captionTiming.find((item) => item.clipId === (clip._id as string))?.timingStrategy ?? null,
        captionPhraseCount: captionTiming.find((item) => item.clipId === (clip._id as string))?.phraseCount ?? null,
      })),
    };
  },
});

function latestStageOutput(jobs: Array<{ type: string; status: string; metadata?: unknown }>, stage: string) {
  return jobs.find((job) => job.type === stage && job.status === "complete")?.metadata;
}

function readSceneTimestamps(value: unknown) {
  const metadata = stageMetadata(value);
  return arrayValue(metadata?.sceneTimestamps).filter(isFiniteNumber).sort((a, b) => a - b);
}

function readSceneIntervals(value: unknown): SceneInterval[] {
  const metadata = stageMetadata(value);
  return arrayValue(metadata?.sceneIntervals).flatMap((item) => {
    if (!isRecord(item) || !isFiniteNumber(item.startSec) || !isFiniteNumber(item.endSec) || !isFiniteNumber(item.durationSec) || !isFiniteNumber(item.representativeSec)) return [];
    if (item.startSec < 0 || item.endSec <= item.startSec || item.durationSec <= 0 || item.representativeSec < item.startSec || item.representativeSec > item.endSec) return [];
    return [{ startSec: item.startSec, endSec: item.endSec, durationSec: item.durationSec, representativeSec: item.representativeSec }];
  });
}

function readCropTracks(value: unknown): CropTrack[] {
  const metadata = stageMetadata(value);
  return arrayValue(metadata?.cropTracks).filter(isCropTrack);
}

function readCaptionTiming(value: unknown) {
  const metadata = stageMetadata(value);
  return arrayValue(metadata?.captionTiming).flatMap((item) => {
    if (!isRecord(item) || typeof item.clipId !== "string" || !isTimingStrategy(item.timingStrategy)) return [];
    return [{
      clipId: item.clipId,
      timingStrategy: item.timingStrategy,
      phraseCount: typeof item.phraseCount === "number" ? item.phraseCount : 0,
      wordHighlighting: item.wordHighlighting === true,
    }];
  });
}

function stageMetadata(value: unknown): Record<string, unknown> | null {
  const root = isRecord(value) ? value : null;
  const nested = root && isRecord(root.metadata) ? root.metadata : null;
  return nested ?? root;
}

function isCropTrack(value: unknown): value is CropTrack {
  if (!isRecord(value) || typeof value.clipId !== "string" || value.timebase !== "absolute-video-seconds" || value.coordinateSpace !== "normalized") return false;
  return arrayValue(value.tracks).every((track) => isRecord(track) && isFiniteNumber(track.startSec) && isFiniteNumber(track.endSec) && track.endSec > track.startSec && isFiniteNumber(track.focusX) && track.focusX >= 0 && track.focusX <= 1 && isFiniteNumber(track.focusY) && track.focusY >= 0 && track.focusY <= 1 && isFiniteNumber(track.confidence) && track.confidence >= 0 && track.confidence <= 1);
}

function isTimingStrategy(value: unknown): value is "word" | "segment" | "estimated" {
  return value === "word" || value === "segment" || value === "estimated";
}

function overlaps(startA: number, endA: number, startB: number, endB: number) {
  return endA > startB && startA < endB;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
