import { openAsBlob } from "node:fs";
import { basename } from "node:path";
import { z } from "zod";
import { WorkerError } from "./errors.js";

const whisperResponseSchema = z.object({
  language: z.string().optional(),
  text: z.string().min(1),
  segments: z.array(z.object({
    start: z.number().finite().nonnegative(),
    end: z.number().positive(),
    text: z.string(),
    speaker: z.string().optional(),
  })),
  words: z.array(z.object({
    start: z.number().finite().nonnegative(),
    end: z.number().positive(),
    word: z.string(),
    probability: z.number().min(0).max(1).optional(),
  })).optional(),
});

const elevenLabsWordSchema = z.object({
  start: z.number().finite().nonnegative(),
  end: z.number().finite().nonnegative(),
  text: z.string(),
  type: z.string().optional(),
  speaker_id: z.string().nullish(),
  logprob: z.number().finite().optional(),
});

const elevenLabsResponseSchema = z.object({
  language_code: z.string().trim().min(1).optional(),
  text: z.string().trim().min(1),
  words: z.array(elevenLabsWordSchema),
});

const MAX_TRANSCRIPT_TEXT_CHARS = 2_000_000;
const MAX_TRANSCRIPT_WORDS = 500_000;
const MAX_PROVIDER_RESPONSE_CHARS = 50_000_000;
const MAX_SEGMENT_WORDS = 40;
const MAX_SEGMENT_DURATION_SEC = 15;
const SEGMENT_GAP_SEC = 1.25;

export type TranscriptionProvider = "elevenlabs" | "whisper";
type Fetcher = typeof fetch;
type NormalizedWord = { startSec: number; endSec: number; text: string; speaker?: string; confidence?: number };

export function transcriptionProvider(): TranscriptionProvider | null {
  const requested = optionalEnv("TRANSCRIPTION_PROVIDER")?.toLowerCase();
  if (requested) {
    return requested === "elevenlabs" || requested === "whisper" ? requested : null;
  }
  if (optionalEnv("ELEVENLABS_API_KEY")) return "elevenlabs";
  if (optionalEnv("WHISPER_BASE_URL")) return "whisper";
  return null;
}

export function transcriptionConfigured() {
  try {
    requireTranscriptionProvider();
    return true;
  } catch {
    return false;
  }
}

export function requireTranscriptionProvider() {
  const requested = optionalEnv("TRANSCRIPTION_PROVIDER")?.toLowerCase();
  if (requested && requested !== "elevenlabs" && requested !== "whisper") {
    throw new WorkerError("CONFIGURATION_ERROR", "TRANSCRIPTION_PROVIDER must be either elevenlabs or whisper", false);
  }
  const provider = transcriptionProvider();
  if (!provider) throw new WorkerError("CONFIGURATION_ERROR", "Transcription provider is not configured; set ELEVENLABS_API_KEY or WHISPER_BASE_URL", false);
  if (provider === "elevenlabs") {
    requiredEnv("ELEVENLABS_API_KEY");
    httpBaseUrl("ELEVENLABS_BASE_URL", "https://api.elevenlabs.io/v1");
    booleanEnv("ELEVENLABS_DIARIZE", false);
    booleanEnv("ELEVENLABS_NO_VERBATIM", false);
  } else {
    httpBaseUrl("WHISPER_BASE_URL", requiredEnv("WHISPER_BASE_URL"));
  }
  transcriptionTimeoutMs();
  return provider;
}

export async function transcribe(audioPath: string, fetcher: Fetcher = fetch) {
  const provider = requireTranscriptionProvider();
  return provider === "elevenlabs"
    ? transcribeWithElevenLabs(audioPath, fetcher)
    : transcribeWithWhisper(audioPath, fetcher);
}

export function parseElevenLabsTranscript(value: unknown, modelId = "scribe_v2") {
  const parsed = elevenLabsResponseSchema.safeParse(value);
  if (!parsed.success) throw invalidResponse("ElevenLabs");
  if (parsed.data.text.length > MAX_TRANSCRIPT_TEXT_CHARS) throw invalidResponse("ElevenLabs");

  const words = parsed.data.words
    .filter((word) => word.type === undefined || word.type === "word")
    .map((word) => {
      const text = word.text.trim();
      if (!text || word.end <= word.start) return null;
      const speaker = word.speaker_id?.trim() || undefined;
      const confidence = word.logprob === undefined ? undefined : clamp(Math.exp(word.logprob), 0, 1);
      return { startSec: word.start, endSec: word.end, text, ...(speaker ? { speaker } : {}), ...(confidence === undefined ? {} : { confidence }) };
    })
    .filter((word): word is NormalizedWord => word !== null)
    .sort((left, right) => left.startSec - right.startSec || left.endSec - right.endSec);

  if (!words.length || words.length > MAX_TRANSCRIPT_WORDS) throw invalidResponse("ElevenLabs");
  return {
    language: parsed.data.language_code,
    fullText: parsed.data.text,
    engine: `elevenlabs-${modelId}`,
    segments: buildElevenLabsSegments(words),
    words,
  };
}

export function buildElevenLabsSegments(words: readonly NormalizedWord[]) {
  const segments: Array<{ startSec: number; endSec: number; text: string; speaker?: string }> = [];
  let current: NormalizedWord[] = [];

  const flush = () => {
    if (!current.length) return;
    const first = current[0];
    const last = current.at(-1);
    if (!first || !last) return;
    const text = joinWords(current);
    if (text) segments.push({
      startSec: first.startSec,
      endSec: last.endSec,
      text,
      ...(current.every((word) => word.speaker === first.speaker) && first.speaker ? { speaker: first.speaker } : {}),
    });
    current = [];
  };

  for (const word of words) {
    const previous = current.at(-1);
    const first = current[0];
    const speakerChanged = Boolean(previous && (previous.speaker || word.speaker) && previous.speaker !== word.speaker);
    const pause = Boolean(previous && word.startSec - previous.endSec > SEGMENT_GAP_SEC);
    const tooManyWords = current.length >= MAX_SEGMENT_WORDS;
    const tooLong = Boolean(first && word.endSec - first.startSec > MAX_SEGMENT_DURATION_SEC);
    if (current.length && (speakerChanged || pause || tooManyWords || tooLong)) flush();

    current.push(word);
    if (sentenceBoundary(word.text)) flush();
  }
  flush();
  return segments;
}

async function transcribeWithWhisper(audioPath: string, fetcher: Fetcher) {
  const baseUrl = httpBaseUrl("WHISPER_BASE_URL", requiredEnv("WHISPER_BASE_URL"));
  const form = await audioForm(audioPath);
  form.set("word_timestamps", "true");
  const response = await requestTranscription(fetcher, `${baseUrl.replace(/\/$/, "")}/transcribe`, process.env.WHISPER_API_KEY ? { Authorization: `Bearer ${process.env.WHISPER_API_KEY}` } : undefined, form, "Whisper");
  const parsed = await parseJsonResponse(response, whisperResponseSchema, "Whisper");
  return {
    language: parsed.language,
    fullText: parsed.text,
    engine: "faster-whisper",
    segments: parsed.segments.map((segment) => ({ startSec: segment.start, endSec: segment.end, text: segment.text, speaker: segment.speaker })),
    words: parsed.words?.map((word) => ({ startSec: word.start, endSec: word.end, text: word.word, confidence: word.probability })),
  };
}

async function transcribeWithElevenLabs(audioPath: string, fetcher: Fetcher) {
  const modelId = optionalEnv("ELEVENLABS_STT_MODEL_ID") ?? "scribe_v2";
  const baseUrl = httpBaseUrl("ELEVENLABS_BASE_URL", "https://api.elevenlabs.io/v1");
  const form = await audioForm(audioPath);
  form.set("model_id", modelId);
  form.set("timestamps_granularity", "word");
  form.set("tag_audio_events", "false");
  if (booleanEnv("ELEVENLABS_DIARIZE", false)) form.set("diarize", "true");
  if (modelId === "scribe_v2" && booleanEnv("ELEVENLABS_NO_VERBATIM", false)) form.set("no_verbatim", "true");

  const response = await requestTranscription(fetcher, `${baseUrl}/speech-to-text`, { "xi-api-key": requiredEnv("ELEVENLABS_API_KEY") }, form, "ElevenLabs");
  return parseElevenLabsTranscript(await parseJsonResponse(response, z.unknown(), "ElevenLabs"), modelId);
}

async function audioForm(audioPath: string) {
  const form = new FormData();
  form.set("file", await openAsBlob(audioPath, { type: "audio/wav" }), basename(audioPath));
  return form;
}

async function requestTranscription(fetcher: Fetcher, url: string, headers: Record<string, string> | undefined, body: FormData, provider: string) {
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(transcriptionTimeoutMs()),
    });
  } catch (error) {
    throw new WorkerError("TRANSCRIPTION_UNAVAILABLE", `${provider} transcription request failed`, true, { cause: error });
  }
  if (!response.ok) {
    if (response.status === 429) throw new WorkerError("TRANSCRIPTION_RATE_LIMITED", `${provider} returned HTTP 429`, true);
    if (response.status === 408 || response.status >= 500) throw new WorkerError("TRANSCRIPTION_UNAVAILABLE", `${provider} returned HTTP ${response.status}`, true);
    if (response.status === 401 || response.status === 403) throw new WorkerError("CONFIGURATION_ERROR", `${provider} authentication failed (HTTP ${response.status})`, false);
    throw new WorkerError("CONFIGURATION_ERROR", `${provider} rejected the request with HTTP ${response.status}`, false);
  }
  return response;
}

async function parseJsonResponse<TSchema extends z.ZodType>(response: Response, schema: TSchema, provider: string): Promise<z.infer<TSchema>> {
  let raw: string;
  try {
    raw = await response.text();
  } catch (error) {
    throw new WorkerError("TRANSCRIPTION_UNAVAILABLE", `${provider} response could not be read`, true, { cause: error });
  }
  if (!raw || raw.length > MAX_PROVIDER_RESPONSE_CHARS) throw invalidResponse(provider);
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    throw invalidResponse(provider);
  }
  const parsed = schema.safeParse(decoded);
  if (!parsed.success) throw invalidResponse(provider);
  return parsed.data;
}

function invalidResponse(provider: string) {
  return new WorkerError("CONFIGURATION_ERROR", `${provider} returned an invalid transcription response`, false);
}

function joinWords(words: readonly NormalizedWord[]) {
  return words.reduce((result, word) => {
    if (!result) return word.text;
    if (/^[,.;:!?%)}\]]/.test(word.text) || /^[’'”]/.test(word.text)) return result + word.text;
    if (/[([{]$/.test(result)) return result + word.text;
    return `${result} ${word.text}`;
  }, "").trim();
}

function sentenceBoundary(text: string) {
  return /[.!?…]["'”’)}\]]*$/.test(text);
}

function httpBaseUrl(name: string, fallback: string) {
  const value = optionalEnv(name) ?? fallback;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("unsupported protocol");
    return parsed.toString().replace(/\/$/, "");
  } catch {
    throw new WorkerError("CONFIGURATION_ERROR", `${name} must be a valid HTTP(S) URL`, false);
  }
}

function transcriptionTimeoutMs() {
  const parsed = Number(optionalEnv("TRANSCRIPTION_TIMEOUT_MS") ?? optionalEnv("WHISPER_TIMEOUT_MS"));
  return Number.isFinite(parsed) ? Math.min(30 * 60 * 1000, Math.max(60_000, Math.round(parsed))) : 15 * 60 * 1000;
}

function booleanEnv(name: string, fallback: boolean) {
  const value = optionalEnv(name);
  if (!value) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new WorkerError("CONFIGURATION_ERROR", `${name} must be true or false`, false);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function requiredEnv(name: string) {
  const value = optionalEnv(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function optionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}
