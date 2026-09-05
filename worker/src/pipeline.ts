import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeCaptionFile } from "./captions.js";
import { createProxy, createThumbnail, detectScenes, downloadYoutube, extractAudio, inspectVideo, renderVerticalClip } from "./ffmpeg.js";
import { downloadObject, uploadObject } from "./storage.js";
import { transcribe } from "./transcription.js";
import type { StageOutputs, WorkerJob } from "./types.js";

export async function processJob(job: WorkerJob): Promise<StageOutputs> {
  const workDir = await mkdtemp(join(tmpdir(), `clipfactory-${job.jobId}-`));
  try {
    if (job.stage === "ingest") return ingest(job, workDir);
    if (job.stage === "transcribe") return transcription(job, workDir);
    if (job.stage === "scene_detect") return scenes(job, workDir);
    if (job.stage === "face_track") return faceTracking(job);
    if (job.stage === "caption_render") return captions(job, workDir);
    if (job.stage === "clip_render") return clips(job, workDir);
    return thumbnails(job, workDir);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function ingest(job: WorkerJob, workDir: string) {
  const source = join(workDir, "source.mp4");
  if (job.sourceType === "youtube") {
    if (!job.originalUrl) throw new Error("YouTube job has no source URL");
    await downloadYoutube(job.originalUrl, source);
  } else {
    if (!job.originalObjectKey) throw new Error("Upload job has no source object key");
    await downloadObject(job.originalObjectKey, source);
  }
  const metadata = await inspectVideo(source);
  const proxy = join(workDir, "proxy.mp4");
  const audio = join(workDir, "audio.wav");
  await Promise.all([createProxy(source, proxy), extractAudio(source, audio)]);
  const proxyObjectKey = `${job.outputPrefix}/proxy/source.mp4`;
  const audioObjectKey = `${job.outputPrefix}/audio/source.wav`;
  const [proxyUrl, audioUrl] = await Promise.all([uploadObject(proxyObjectKey, proxy, "video/mp4"), uploadObject(audioObjectKey, audio, "audio/wav")]);
  return { ...metadata, proxyObjectKey, audioObjectKey, proxyUrl, audioUrl };
}

async function transcription(job: WorkerJob, workDir: string) {
  if (!job.audioObjectKey) throw new Error("Transcription job has no audio object key");
  const audio = join(workDir, "source.wav");
  await downloadObject(job.audioObjectKey, audio);
  return transcribe(audio);
}

async function scenes(job: WorkerJob, workDir: string) {
  const source = await localProxy(job, workDir);
  return { metadata: { sceneTimestamps: await detectScenes(source), threshold: 0.35 } };
}

async function faceTracking(job: WorkerJob) {
  const endpoint = process.env.FACE_TRACKER_URL?.trim();
  if (!endpoint) return { metadata: { cropStrategy: "center", reason: "FACE_TRACKER_URL is not configured" } };
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", ...(process.env.FACE_TRACKER_API_KEY ? { Authorization: `Bearer ${process.env.FACE_TRACKER_API_KEY}` } : {}) }, body: JSON.stringify({ projectId: job.projectId, proxyObjectKey: job.proxyObjectKey, clips: job.clips }) });
  if (!response.ok) throw new Error(`Face tracker returned HTTP ${response.status}`);
  return { metadata: { cropStrategy: "face-track", tracks: await response.json() } };
}

async function captions(job: WorkerJob, workDir: string) {
  const keys: string[] = [];
  for (const clip of job.clips) {
    const path = join(workDir, `${clip.id}.ass`);
    await writeCaptionFile(path, clip.transcriptExcerpt, clip.endSec - clip.startSec, clip.captionPresetKey);
    const key = `${job.outputPrefix}/captions/${clip.id}.ass`;
    await uploadObject(key, path, "text/x-ssa");
    keys.push(key);
  }
  return { metadata: { captionObjectKeys: keys, wordHighlighting: false } };
}

async function clips(job: WorkerJob, workDir: string) {
  const source = await localProxy(job, workDir);
  const clipAssets: NonNullable<StageOutputs["clipAssets"]> = [];
  for (const clip of job.clips) {
    const captionPath = join(workDir, `${clip.id}.ass`);
    await downloadObject(`${job.outputPrefix}/captions/${clip.id}.ass`, captionPath);
    const output = join(workDir, `${clip.id}.mp4`);
    await renderVerticalClip({ input: source, captions: captionPath, output, startSec: clip.startSec, durationSec: clip.endSec - clip.startSec });
    const finalObjectKey = `${job.outputPrefix}/clips/${clip.id}.mp4`;
    const finalUrl = await uploadObject(finalObjectKey, output, "video/mp4");
    clipAssets.push({ clipId: clip.id, finalObjectKey, finalUrl, previewObjectKey: finalObjectKey, previewUrl: finalUrl });
  }
  return { clipAssets };
}

async function thumbnails(job: WorkerJob, workDir: string) {
  const clipAssets: NonNullable<StageOutputs["clipAssets"]> = [];
  for (const clip of job.clips) {
    const video = join(workDir, `${clip.id}.mp4`);
    const image = join(workDir, `${clip.id}.jpg`);
    await downloadObject(`${job.outputPrefix}/clips/${clip.id}.mp4`, video);
    await createThumbnail(video, image);
    const thumbnailObjectKey = `${job.outputPrefix}/thumbnails/${clip.id}.jpg`;
    const thumbnailUrl = await uploadObject(thumbnailObjectKey, image, "image/jpeg");
    clipAssets.push({ clipId: clip.id, thumbnailObjectKey, thumbnailUrl });
  }
  return { clipAssets };
}

async function localProxy(job: WorkerJob, workDir: string) {
  if (!job.proxyObjectKey) throw new Error(`${job.stage} job has no proxy object key`);
  const source = join(workDir, "proxy.mp4");
  await downloadObject(job.proxyObjectKey, source);
  return source;
}
