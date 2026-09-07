import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { z } from "zod";
import { WorkerError } from "./errors.js";

const responseSchema = z.object({
  language: z.string().optional(),
  text: z.string().min(1),
  segments: z.array(z.object({ start: z.number().nonnegative(), end: z.number().positive(), text: z.string(), speaker: z.string().optional() })),
  words: z.array(z.object({ start: z.number().nonnegative(), end: z.number().positive(), word: z.string(), probability: z.number().min(0).max(1).optional() })).optional(),
});

export async function transcribe(audioPath: string) {
  const baseUrl = requiredEnv("WHISPER_BASE_URL");
  const form = new FormData();
  form.set("file", new Blob([await readFile(audioPath)], { type: "audio/wav" }), basename(audioPath));
  form.set("word_timestamps", "true");
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/transcribe`, {
    method: "POST",
    headers: process.env.WHISPER_API_KEY ? { Authorization: `Bearer ${process.env.WHISPER_API_KEY}` } : undefined,
    body: form,
    signal: AbortSignal.timeout(transcriptionTimeoutMs()),
  });
  if (!response.ok) {
    if (response.status === 429) throw new WorkerError("TRANSCRIPTION_RATE_LIMITED", "Transcription service returned HTTP 429", true);
    if (response.status === 408 || response.status >= 500) throw new WorkerError("TRANSCRIPTION_UNAVAILABLE", `Transcription service returned HTTP ${response.status}`, true);
    throw new WorkerError("CONFIGURATION_ERROR", `Transcription service rejected the request with HTTP ${response.status}`, false);
  }
  const parsed = responseSchema.parse(await response.json());
  return {
    language: parsed.language,
    fullText: parsed.text,
    engine: "faster-whisper",
    segments: parsed.segments.map((segment) => ({ startSec: segment.start, endSec: segment.end, text: segment.text, speaker: segment.speaker })),
    words: parsed.words?.map((word) => ({ startSec: word.start, endSec: word.end, text: word.word, confidence: word.probability })),
  };
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function transcriptionTimeoutMs() {
  const parsed = Number(process.env.WHISPER_TIMEOUT_MS);
  return Number.isFinite(parsed) ? Math.min(30 * 60 * 1000, Math.max(60_000, Math.round(parsed))) : 15 * 60 * 1000;
}
