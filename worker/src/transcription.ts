import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { z } from "zod";

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
  });
  if (!response.ok) throw new Error(`Transcription service returned HTTP ${response.status}`);
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
