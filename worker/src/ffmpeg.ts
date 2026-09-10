import { spawn } from "node:child_process";
import { z } from "zod";
import { buildCropPlan, type CropPlan, type CropPlanInput, type SourceDimensions } from "./crop.js";
import { WorkerError } from "./errors.js";

const probeSchema = z.object({
  format: z.object({ duration: z.coerce.number().positive(), format_name: z.string().min(1).optional() }),
  streams: z.array(z.object({ codec_type: z.string(), codec_name: z.string().min(1).optional(), width: z.number().int().positive().optional(), height: z.number().int().positive().optional(), avg_frame_rate: z.string().optional() })),
});

export async function inspectVideo(input: string, maximumDurationSec = Number.POSITIVE_INFINITY) {
  try {
    const result = await run(process.env.FFPROBE_PATH || "ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", input]);
    const parsed = probeSchema.parse(JSON.parse(result.stdout));
    const video = parsed.streams.find((stream) => stream.codec_type === "video");
    if (!video) throw new WorkerError("INVALID_MEDIA", "Source has no video stream", false);
    if (!video.codec_name || !video.width || !video.height || video.width < 16 || video.height < 16 || video.width > 16_384 || video.height > 16_384) {
      throw new WorkerError("INVALID_MEDIA", "Source video stream metadata is malformed", false);
    }
    if (parsed.format.duration > maximumDurationSec) throw new WorkerError("INVALID_MEDIA", `Source video exceeds the ${Math.round(maximumDurationSec / 60)} minute limit`, false);
    const [numerator, denominator] = (video.avg_frame_rate ?? "0/1").split("/").map(Number);
    const fps = denominator ? numerator / denominator : undefined;
    if (fps !== undefined && (!Number.isFinite(fps) || fps <= 0 || fps > 240)) throw new WorkerError("INVALID_MEDIA", "Source frame rate is malformed", false);
    return { durationSec: parsed.format.duration, width: video.width, height: video.height, fps, codec: video.codec_name, container: parsed.format.format_name };
  } catch (error) {
    if (error instanceof WorkerError) throw error;
    throw new WorkerError("INVALID_MEDIA", `FFprobe could not validate the source media: ${error instanceof Error ? error.message : "invalid response"}`, false, { cause: error });
  }
}

export async function checkMediaCapabilities() {
  const ffmpeg = await commandWorks(process.env.FFMPEG_PATH || "ffmpeg", ["-version"]);
  const ffprobe = await commandWorks(process.env.FFPROBE_PATH || "ffprobe", ["-version"]);
  let subtitles = false;
  if (ffmpeg) {
    try {
      const result = await run(process.env.FFMPEG_PATH || "ffmpeg", ["-hide_banner", "-filters"]);
      subtitles = /\bsubtitles\b/.test(result.stdout);
    } catch {
      subtitles = false;
    }
  }
  const ytdlp = await commandWorks(process.env.YT_DLP_PATH || "yt-dlp", ["--version"]);
  return { ffmpeg, ffprobe, subtitles, ytdlp };
}

export async function createProxy(input: string, output: string) {
  await run(process.env.FFMPEG_PATH || "ffmpeg", ["-y", "-i", input, "-vf", "scale='min(1280,iw)':-2", "-c:v", "libx264", "-threads", "2", "-preset", "veryfast", "-crf", "27", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", output]);
}

export async function extractAudio(input: string, output: string) {
  await run(process.env.FFMPEG_PATH || "ffmpeg", ["-y", "-i", input, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", output]);
}

export async function downloadYoutube(url: string, output: string) {
  await run(process.env.YT_DLP_PATH || "yt-dlp", ["--no-playlist", "--js-runtimes", "node", "--format", "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b", "--merge-output-format", "mp4", "--output", output, url]);
}

export async function detectScenes(input: string) {
  const result = await run(process.env.FFMPEG_PATH || "ffmpeg", ["-i", input, "-filter:v", "select='gt(scene,0.35)',showinfo", "-f", "null", "-"]);
  return Array.from(result.stderr.matchAll(/pts_time:([0-9.]+)/g), (match) => Number(match[1])).filter(Number.isFinite);
}

export type RenderVerticalClipOptions = {
  input: string;
  captions?: string;
  output: string;
  startSec: number;
  durationSec: number;
  source?: SourceDimensions;
  cropPlan?: CropPlan;
  crop?: Omit<CropPlanInput, "source" | "clipEndSec">;
};

export type RenderVerticalClipResult = {
  cropPlan: CropPlan;
  outputWidth: 1080;
  outputHeight: 1920;
};

export async function renderVerticalClip(options: RenderVerticalClipOptions): Promise<RenderVerticalClipResult> {
  const source = options.source ?? await sourceDimensionsFromProbe(options.input);
  const cropPlan = options.cropPlan ?? buildCropPlan({
    clipId: options.crop?.clipId ?? "render",
    clipStartSec: options.startSec,
    clipEndSec: options.startSec + options.durationSec,
    source,
    cropTrack: options.crop?.cropTrack,
    sceneTimestamps: options.crop?.sceneTimestamps,
    tuning: options.crop?.tuning,
  });
  const filter = buildVerticalVideoFilter(cropPlan, options.captions);
  await run(process.env.FFMPEG_PATH || "ffmpeg", [
    "-y",
    "-ss",
    String(Math.max(0, options.startSec)),
    "-i",
    options.input,
    "-t",
    String(Math.max(0.01, options.durationSec)),
    "-vf",
    filter,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-c:v",
    "libx264",
    "-threads",
    "2",
    "-preset",
    "medium",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-movflags",
    "+faststart",
    options.output,
  ]);
  return { cropPlan, outputWidth: 1080, outputHeight: 1920 };
}

export function buildVerticalVideoFilter(cropPlan: CropPlan, captions?: string) {
  const filters = cropPlan.geometry.mode === "fit"
    ? ["scale=1080:1920:force_original_aspect_ratio=decrease", "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black"]
    : [
        `crop=w=${cropPlan.geometry.cropWidth}:h=${cropPlan.geometry.cropHeight}:x='${buildPositionExpression(cropPlan.keyframes, "x", cropPlan.geometry.maxX)}':y='${buildPositionExpression(cropPlan.keyframes, "y", cropPlan.geometry.maxY)}'`,
        "scale=1080:1920:flags=lanczos",
      ];
  filters.push("setsar=1");
  if (captions) filters.push(`subtitles=filename='${escapeSubtitlePath(captions)}'`);
  return filters.join(",");
}

export function buildPositionExpression(keyframes: CropPlan["keyframes"], axis: "x" | "y", maximum: number) {
  if (maximum <= 0 || keyframes.length <= 1) return "0";
  const positions = keyframes.map((keyframe) => Math.round(keyframe[axis]));
  if (positions.every((position) => position === positions[0])) return String(positions[0] ?? 0);
  let expression = String(positions.at(-1) ?? 0);
  for (let index = keyframes.length - 2; index >= 0; index -= 1) {
    const current = keyframes[index];
    const next = keyframes[index + 1];
    if (!current || !next) continue;
    const deltaTime = Math.max(0.001, next.timeSec - current.timeSec);
    const currentPosition = positions[index] ?? 0;
    const nextPosition = positions[index + 1] ?? currentPosition;
    const interpolation = `${currentPosition}+(${nextPosition - currentPosition})*(t-${formatNumber(current.timeSec)})/${formatNumber(deltaTime)}`;
    expression = `if(lt(t,${formatNumber(next.timeSec)}),${interpolation},${expression})`;
  }
  return `max(0,min(${Math.round(maximum)},${expression}))`.replaceAll(",", "\\,");
}

export function escapeSubtitlePath(path: string) {
  return path.replaceAll("\\", "/").replaceAll(":", "\\:").replaceAll("'", "\\'");
}

export async function createThumbnail(input: string, output: string) {
  await run(process.env.FFMPEG_PATH || "ffmpeg", ["-y", "-ss", "1", "-i", input, "-frames:v", "1", "-q:v", "2", output]);
}

async function sourceDimensionsFromProbe(input: string): Promise<SourceDimensions> {
  const metadata = await inspectVideo(input);
  if (!metadata.width || !metadata.height) throw new Error("FFprobe did not return usable source dimensions");
  return { width: metadata.width, height: metadata.height, fps: metadata.fps };
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

async function run(command: string, args: string[]) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { if (stdout.length < 2_000_000) stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { if (stderr.length < 2_000_000) stderr += chunk; });
    child.on("error", (error) => reject(new Error(`${command} could not start: ${error.message}`)));
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const detail = stderr.slice(-2000);
      if (command.endsWith("ffmpeg") && args.some((argument) => argument.includes("subtitles=")) && detail.includes("No such filter: 'subtitles'")) {
        reject(new Error("FFmpeg was built without the subtitles/libass filter required to burn ASS captions"));
        return;
      }
      reject(new Error(`${command} exited with code ${code}: ${detail}`));
    });
  });
}

async function commandWorks(command: string, args: string[]) {
  try {
    await run(command, args);
    return true;
  } catch {
    return false;
  }
}
