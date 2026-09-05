import { spawn } from "node:child_process";
import { z } from "zod";

const probeSchema = z.object({
  format: z.object({ duration: z.coerce.number().positive() }),
  streams: z.array(z.object({ codec_type: z.string(), width: z.number().optional(), height: z.number().optional(), avg_frame_rate: z.string().optional() })),
});

export async function inspectVideo(input: string) {
  const result = await run(process.env.FFPROBE_PATH || "ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", input]);
  const parsed = probeSchema.parse(JSON.parse(result.stdout));
  const video = parsed.streams.find((stream) => stream.codec_type === "video");
  const [numerator, denominator] = (video?.avg_frame_rate ?? "0/1").split("/").map(Number);
  return { durationSec: parsed.format.duration, width: video?.width, height: video?.height, fps: denominator ? numerator / denominator : undefined };
}

export async function createProxy(input: string, output: string) {
  await run(process.env.FFMPEG_PATH || "ffmpeg", ["-y", "-i", input, "-vf", "scale='min(1280,iw)':-2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "27", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", output]);
}

export async function extractAudio(input: string, output: string) {
  await run(process.env.FFMPEG_PATH || "ffmpeg", ["-y", "-i", input, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", output]);
}

export async function downloadYoutube(url: string, output: string) {
  await run(process.env.YT_DLP_PATH || "yt-dlp", ["--no-playlist", "--format", "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b", "--merge-output-format", "mp4", "--output", output, url]);
}

export async function detectScenes(input: string) {
  const result = await run(process.env.FFMPEG_PATH || "ffmpeg", ["-i", input, "-filter:v", "select='gt(scene,0.35)',showinfo", "-f", "null", "-"]);
  return Array.from(result.stderr.matchAll(/pts_time:([0-9.]+)/g), (match) => Number(match[1])).filter(Number.isFinite);
}

export async function renderVerticalClip({ input, captions, output, startSec, durationSec }: { input: string; captions: string; output: string; startSec: number; durationSec: number }) {
  const subtitlePath = captions.replaceAll("\\", "/").replaceAll(":", "\\:").replaceAll("'", "\\'");
  const filter = `crop=w='min(iw,ih*9/16)':h='min(ih,iw*16/9)':x='(iw-ow)/2':y='(ih-oh)/2',scale=1080:1920,subtitles='${subtitlePath}'`;
  await run(process.env.FFMPEG_PATH || "ffmpeg", ["-y", "-ss", String(startSec), "-i", input, "-t", String(durationSec), "-vf", filter, "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", output]);
}

export async function createThumbnail(input: string, output: string) {
  await run(process.env.FFMPEG_PATH || "ffmpeg", ["-y", "-ss", "1", "-i", input, "-frames:v", "1", "-q:v", "2", output]);
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
    child.on("close", (code) => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${command} exited with code ${code}: ${stderr.slice(-2000)}`)));
  });
}
