import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeCaptionFile } from "./captions.js";
import { buildSceneIntervals, createProxy, createThumbnail, detectScenes, downloadYoutube, extractAudio, inspectVideo, MIN_SCENE_GAP_SEC, renderVerticalClip, SCENE_THRESHOLD } from "./ffmpeg.js";
import { downloadGoogleDrive } from "./google-drive.js";
import { trackWithOptionalProvider } from "./face-tracking.js";
import type { RenderStat } from "./media-types.js";
import { scanSourceMedia } from "./media-security.js";
import { downloadObject, uploadObject } from "./storage.js";
import { transcribe } from "./transcription.js";
import type { StageOutputs, WorkerJob } from "./types.js";
import { WorkerError } from "./errors.js";

export async function processJob(job: WorkerJob, reportProgress: (progress: number) => void = () => undefined): Promise<StageOutputs> {
  const startedAt = Date.now();
  const workDir = await mkdtemp(join(tmpdir(), `clipfactory-${job.jobId}-`));
  try {
    const outputs = job.stage === "ingest"
      ? await ingest(job, workDir, reportProgress)
      : job.stage === "transcribe"
        ? await transcription(job, workDir, reportProgress)
        : job.stage === "scene_detect"
          ? await scenes(job, workDir, reportProgress)
        : job.stage === "face_track"
            ? await faceTracking(job, reportProgress)
            : job.stage === "caption_render"
              ? await captions(job, workDir, reportProgress)
              : job.stage === "clip_render"
                ? await clips(job, workDir, reportProgress)
                : await thumbnails(job, workDir, reportProgress);
    console.info(JSON.stringify({ event: "clipfactory.worker.stage", jobId: job.jobId, projectId: job.projectId, videoId: job.videoId, stage: job.stage, status: "complete", durationMs: Date.now() - startedAt }));
    return outputs;
  } catch (error) {
    const failureReason = error instanceof Error ? error.message.slice(0, 500) : "Worker stage failed";
    console.error(JSON.stringify({ event: "clipfactory.worker.stage", jobId: job.jobId, projectId: job.projectId, videoId: job.videoId, stage: job.stage, status: "failed", durationMs: Date.now() - startedAt, failureReason }));
    throw error;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function ingest(job: WorkerJob, workDir: string, reportProgress: (progress: number) => void) {
  const source = join(workDir, "source.mp4");
  reportProgress(5);
  if (job.sourceType === "youtube") {
    if (!job.originalUrl) throw new Error("YouTube job has no source URL");
    await downloadYoutube(job.originalUrl, source);
  } else if (job.sourceType === "google_drive") {
    if (!job.originalUrl) throw new Error("Google Drive job has no source URL");
    await downloadGoogleDrive(job.originalUrl, source, job.maxSourceFileBytes, (downloadedBytes, totalBytes) => {
      if (totalBytes) reportProgress(Math.min(24, 5 + Math.round((downloadedBytes / totalBytes) * 19)));
    });
  } else {
    if (!job.originalObjectKey) throw new Error("Upload job has no source object key");
    await downloadObject(job.originalObjectKey, source);
  }
  reportProgress(25);
  const sourceStat = await stat(source);
  if (sourceStat.size <= 0 || sourceStat.size > job.maxSourceFileBytes) throw new WorkerError("INVALID_MEDIA", "Source file size is outside the allowed range", false);
  if (job.sourceType === "upload" && job.sourceFileSizeBytes && sourceStat.size !== job.sourceFileSizeBytes) throw new WorkerError("INVALID_MEDIA", "Uploaded source size does not match the signed upload", false);
  const safety = await scanSourceMedia(source, job.originalObjectKey);
  if (!safety.clean) {
    const reason = "reason" in safety ? safety.reason : undefined;
    throw new WorkerError("INVALID_MEDIA", reason ?? "Source media failed the configured file-safety scan", false);
  }
  const metadata = await inspectVideo(source, job.maxSourceDurationSec);
  reportProgress(45);
  const proxy = join(workDir, "proxy.mp4");
  const audio = join(workDir, "audio.wav");
  await Promise.all([createProxy(source, proxy), extractAudio(source, audio)]);
  reportProgress(75);
  const proxyObjectKey = `${job.outputPrefix}/proxy/source.mp4`;
  const audioObjectKey = `${job.outputPrefix}/audio/source.wav`;
  const [proxyUrl, audioUrl] = await Promise.all([uploadObject(proxyObjectKey, proxy, "video/mp4"), uploadObject(audioObjectKey, audio, "audio/wav")]);
  reportProgress(95);
  return { ...metadata, proxyObjectKey, audioObjectKey, proxyUrl, audioUrl };
}

async function transcription(job: WorkerJob, workDir: string, reportProgress: (progress: number) => void) {
  if (!job.audioObjectKey) throw new Error("Transcription job has no audio object key");
  const audio = join(workDir, "source.wav");
  reportProgress(10);
  await downloadObject(job.audioObjectKey, audio);
  reportProgress(30);
  const result = await transcribe(audio);
  reportProgress(95);
  return result;
}

async function scenes(job: WorkerJob, workDir: string, reportProgress: (progress: number) => void) {
  reportProgress(10);
  const source = await localProxy(job, workDir);
  reportProgress(30);
  const sourceMetadata = await inspectVideo(source);
  const sceneTimestamps = await detectScenes(source);
  const sceneIntervals = buildSceneIntervals(sceneTimestamps, sourceMetadata.durationSec);
  reportProgress(95);
  return { metadata: { sceneTimestamps, sceneIntervals, threshold: SCENE_THRESHOLD, minimumSceneGapSec: MIN_SCENE_GAP_SEC } };
}

async function faceTracking(job: WorkerJob, reportProgress: (progress: number) => void) {
  reportProgress(10);
  const result = await trackWithOptionalProvider({
    projectId: job.projectId,
    videoId: job.videoId,
    proxyObjectKey: job.proxyObjectKey,
    sourceWidth: job.sourceWidth,
    sourceHeight: job.sourceHeight,
    clips: job.clips.map((clip) => ({ id: clip.id, startSec: clip.startSec, endSec: clip.endSec })),
  });
  reportProgress(95);
  return {
    metadata: {
      cropStrategy: result.cropStrategy,
      cropTracks: result.cropTracks,
      ...(result.fallbackReason ? { fallbackReason: result.fallbackReason } : {}),
      tracker: result.tracker,
    },
  };
}

async function captions(job: WorkerJob, workDir: string, reportProgress: (progress: number) => void) {
  const keys: string[] = [];
  const captionTiming = [];
  for (const [index, clip] of job.clips.entries()) {
    const path = join(workDir, `${clip.id}.ass`);
    const track = await writeCaptionFile(path, {
      text: clip.transcriptExcerpt,
      durationSec: clip.endSec - clip.startSec,
      presetKey: clip.captionPresetKey,
      clipStartSec: clip.startSec,
      clipEndSec: clip.endSec,
      words: clip.transcriptWords,
      segments: clip.transcriptSegments,
    });
    const key = `${job.outputPrefix}/captions/${clip.id}.ass`;
    await uploadObject(key, path, "text/x-ssa");
    keys.push(key);
    captionTiming.push({ clipId: clip.id, timingStrategy: track.timingStrategy, phraseCount: track.phrases.length, wordHighlighting: track.timingStrategy === "word" && track.assEventCount > track.phrases.length });
    console.info(JSON.stringify({ event: "clipfactory.caption", jobId: job.jobId, projectId: job.projectId, clipId: clip.id, stage: "caption_render", captionStrategy: track.timingStrategy, captionPhraseCount: track.phrases.length, wordHighlighting: track.timingStrategy === "word" && track.assEventCount > track.phrases.length }));
    reportProgress(progressForItem(index, job.clips.length));
  }
  return { metadata: { captionObjectKeys: keys, captionTiming } };
}

async function clips(job: WorkerJob, workDir: string, reportProgress: (progress: number) => void) {
  const source = await localProxy(job, workDir);
  const probed = await inspectVideo(source);
  const sourceWidth = probed.width ?? job.sourceWidth;
  const sourceHeight = probed.height ?? job.sourceHeight;
  if (!sourceWidth || !sourceHeight) throw new Error("Source dimensions are unavailable for clip rendering");
  const clipAssets: NonNullable<StageOutputs["clipAssets"]> = [];
  const renderStats: RenderStat[] = [];
  for (const [index, clip] of job.clips.entries()) {
    const captionPath = join(workDir, `${clip.id}.ass`);
    await downloadObject(`${job.outputPrefix}/captions/${clip.id}.ass`, captionPath);
    const output = join(workDir, `${clip.id}.mp4`);
    const renderStartedAt = Date.now();
    const rendered = await renderVerticalClip({
      input: source,
      captions: captionPath,
      output,
      startSec: clip.startSec,
      durationSec: clip.endSec - clip.startSec,
      source: { width: sourceWidth, height: sourceHeight, fps: probed.fps ?? job.sourceFps ?? undefined },
      crop: { clipId: clip.id, clipStartSec: clip.startSec, cropTrack: clip.cropTrack, sceneTimestamps: job.sceneTimestamps },
    });
    const finalObjectKey = `${job.outputPrefix}/clips/${clip.id}.mp4`;
    const finalUrl = await uploadObject(finalObjectKey, output, "video/mp4");
    clipAssets.push({ clipId: clip.id, finalObjectKey, finalUrl, previewObjectKey: finalObjectKey, previewUrl: finalUrl });
    const stat: RenderStat = {
      clipId: clip.id,
      cropStrategy: rendered.cropPlan.strategy,
      cropKeyframeCount: rendered.cropPlan.keyframes.length,
      captionTimingStrategy: clip.captionTimingStrategy,
      captionPhraseCount: clip.captionPhraseCount,
      renderDurationMs: Date.now() - renderStartedAt,
      sourceWidth,
      sourceHeight,
      outputWidth: 1080,
      outputHeight: 1920,
    };
    renderStats.push(stat);
    console.info(JSON.stringify({ event: "clipfactory.render", jobId: job.jobId, projectId: job.projectId, clipId: clip.id, stage: "clip_render", cropStrategy: stat.cropStrategy, captionStrategy: stat.captionTimingStrategy, cropKeyframes: stat.cropKeyframeCount, captionPhrases: stat.captionPhraseCount, renderDurationMs: stat.renderDurationMs, sourceDimensions: `${sourceWidth}x${sourceHeight}`, outputDimensions: "1080x1920" }));
    reportProgress(progressForItem(index, job.clips.length));
  }
  return { clipAssets, metadata: { renderStats } };
}

async function thumbnails(job: WorkerJob, workDir: string, reportProgress: (progress: number) => void) {
  const clipAssets: NonNullable<StageOutputs["clipAssets"]> = [];
  for (const [index, clip] of job.clips.entries()) {
    const video = join(workDir, `${clip.id}.mp4`);
    const image = join(workDir, `${clip.id}.jpg`);
    await downloadObject(`${job.outputPrefix}/clips/${clip.id}.mp4`, video);
    await createThumbnail(video, image);
    const thumbnailObjectKey = `${job.outputPrefix}/thumbnails/${clip.id}.jpg`;
    const thumbnailUrl = await uploadObject(thumbnailObjectKey, image, "image/jpeg");
    clipAssets.push({ clipId: clip.id, thumbnailObjectKey, thumbnailUrl });
    reportProgress(progressForItem(index, job.clips.length));
  }
  return { clipAssets };
}

function progressForItem(index: number, total: number) {
  return total ? Math.min(95, Math.round(10 + ((index + 1) / total) * 85)) : 95;
}

async function localProxy(job: WorkerJob, workDir: string) {
  if (!job.proxyObjectKey) throw new Error(`${job.stage} job has no proxy object key`);
  const source = join(workDir, "proxy.mp4");
  await downloadObject(job.proxyObjectKey, source);
  return source;
}
