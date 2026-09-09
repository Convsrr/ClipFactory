import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { classifyWorkerError, WorkerError } from "../worker/src/errors";
import {
  buildElevenLabsSegments,
  parseElevenLabsTranscript,
  requireTranscriptionProvider,
  transcribe,
  transcriptionConfigured,
  transcriptionProvider,
} from "../worker/src/transcription";

const ENV_NAMES = [
  "TRANSCRIPTION_PROVIDER",
  "ELEVENLABS_API_KEY",
  "ELEVENLABS_BASE_URL",
  "ELEVENLABS_STT_MODEL_ID",
  "ELEVENLABS_DIARIZE",
  "ELEVENLABS_NO_VERBATIM",
  "TRANSCRIPTION_TIMEOUT_MS",
  "WHISPER_BASE_URL",
  "WHISPER_API_KEY",
  "WHISPER_TIMEOUT_MS",
] as const;

async function withEnv(values: Partial<Record<(typeof ENV_NAMES)[number], string | undefined>>, action: () => Promise<void> | void) {
  const previous = new Map(ENV_NAMES.map((name) => [name, process.env[name]]));
  for (const name of ENV_NAMES) delete process.env[name];
  for (const [name, value] of Object.entries(values)) {
    if (value !== undefined) process.env[name] = value;
  }
  try {
    await action();
  } finally {
    for (const name of ENV_NAMES) {
      const value = previous.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

async function audioFixture() {
  const directory = await mkdtemp(join(tmpdir(), "clipfactory-transcription-"));
  const path = join(directory, "source.wav");
  await writeFile(path, "deterministic test audio");
  return { directory, path };
}

test("ElevenLabs words ignore spacing/events and form speaker-aware segments", () => {
  const parsed = parseElevenLabsTranscript({
    language_code: "en",
    text: "Hello world. Welcome back!",
    words: [
      { type: "word", start: 0, end: 0.4, text: "Hello", speaker_id: "speaker_0", logprob: 0 },
      { type: "spacing", start: 0.4, end: 0.5, text: " " },
      { type: "word", start: 0.5, end: 0.9, text: "world.", speaker_id: "speaker_0", logprob: -0.1 },
      { type: "audio_event", start: 0.9, end: 1, text: "[music]" },
      { type: "word", start: 2, end: 2.4, text: "Welcome", speaker_id: "speaker_1" },
      { type: "word", start: 2.4, end: 2.8, text: "back!", speaker_id: "speaker_1" },
    ],
  });

  assert.equal(parsed.engine, "elevenlabs-scribe_v2");
  assert.equal(parsed.language, "en");
  assert.deepEqual(parsed.words.map((word) => word.text), ["Hello", "world.", "Welcome", "back!"]);
  assert.equal(parsed.words[0]?.confidence, 1);
  assert.deepEqual(parsed.segments.map((segment) => ({ text: segment.text, speaker: segment.speaker })), [
    { text: "Hello world.", speaker: "speaker_0" },
    { text: "Welcome back!", speaker: "speaker_1" },
  ]);
});

test("ElevenLabs request uses the server-side key, model, and word timestamps", async () => {
  const fixture = await audioFixture();
  try {
    await withEnv({
      TRANSCRIPTION_PROVIDER: "elevenlabs",
      ELEVENLABS_API_KEY: "test-elevenlabs-key",
      ELEVENLABS_BASE_URL: "https://speech.example/v1/",
      ELEVENLABS_STT_MODEL_ID: "scribe_v2",
      ELEVENLABS_DIARIZE: "true",
      ELEVENLABS_NO_VERBATIM: "true",
      TRANSCRIPTION_TIMEOUT_MS: "60000",
    }, async () => {
      let receivedUrl = "";
      let receivedHeaders: Headers | undefined;
      let receivedForm: FormData | undefined;
      const fetcher: typeof fetch = async (input, init) => {
        receivedUrl = String(input);
        receivedHeaders = new Headers(init?.headers);
        receivedForm = init?.body as FormData;
        return new Response(JSON.stringify({
          language_code: "en",
          text: "Test response.",
          words: [{ type: "word", start: 0, end: 0.5, text: "Test" }, { type: "word", start: 0.5, end: 1, text: "response." }],
        }), { headers: { "content-type": "application/json" } });
      };

      const result = await transcribe(fixture.path, fetcher);
      assert.equal(receivedUrl, "https://speech.example/v1/speech-to-text");
      assert.equal(receivedHeaders?.get("xi-api-key"), "test-elevenlabs-key");
      assert.equal(receivedForm?.get("model_id"), "scribe_v2");
      assert.equal(receivedForm?.get("timestamps_granularity"), "word");
      assert.equal(receivedForm?.get("tag_audio_events"), "false");
      assert.equal(receivedForm?.get("diarize"), "true");
      assert.equal(receivedForm?.get("no_verbatim"), "true");
      assert.ok(receivedForm?.get("file") instanceof Blob);
      assert.deepEqual(result.words?.map((word) => word.text), ["Test", "response."]);
    });
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});

test("provider selection prefers ElevenLabs and keeps Whisper compatibility", async () => {
  await withEnv({ ELEVENLABS_API_KEY: "present", WHISPER_BASE_URL: "https://whisper.example" }, () => {
    assert.equal(transcriptionProvider(), "elevenlabs");
    assert.equal(transcriptionConfigured(), true);
    assert.equal(requireTranscriptionProvider(), "elevenlabs");
  });
  await withEnv({ WHISPER_BASE_URL: "https://whisper.example" }, () => {
    assert.equal(transcriptionProvider(), "whisper");
    assert.equal(transcriptionConfigured(), true);
    assert.equal(requireTranscriptionProvider(), "whisper");
  });
  await withEnv({ TRANSCRIPTION_PROVIDER: "elevenlabs" }, () => {
    assert.equal(transcriptionConfigured(), false);
    assert.throws(() => requireTranscriptionProvider(), /ELEVENLABS_API_KEY/);
  });
  await withEnv({ TRANSCRIPTION_PROVIDER: "not-a-provider", ELEVENLABS_API_KEY: "present" }, () => {
    assert.equal(transcriptionProvider(), null);
    assert.throws(() => requireTranscriptionProvider(), /either elevenlabs or whisper/);
  });
});

test("legacy Whisper requests remain normalized", async () => {
  const fixture = await audioFixture();
  try {
    await withEnv({ TRANSCRIPTION_PROVIDER: "whisper", WHISPER_BASE_URL: "https://whisper.example/api", WHISPER_API_KEY: "test-whisper-key" }, async () => {
      const fetcher: typeof fetch = async (input, init) => {
        assert.equal(String(input), "https://whisper.example/api/transcribe");
        assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-whisper-key");
        assert.equal((init?.body as FormData).get("word_timestamps"), "true");
        return new Response(JSON.stringify({
          language: "en",
          text: "Legacy transcript",
          segments: [{ start: 0, end: 2, text: "Legacy transcript" }],
          words: [{ start: 0, end: 0.5, word: "Legacy", probability: 0.9 }],
        }));
      };
      const result = await transcribe(fixture.path, fetcher);
      assert.equal(result.engine, "faster-whisper");
      assert.equal(result.segments[0]?.text, "Legacy transcript");
      assert.equal(result.words?.[0]?.confidence, 0.9);
    });
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});

test("transcription errors keep retry and configuration boundaries explicit", async () => {
  const fixture = await audioFixture();
  try {
    await withEnv({ TRANSCRIPTION_PROVIDER: "elevenlabs", ELEVENLABS_API_KEY: "present" }, async () => {
      const response = async (status: number, body = "") => {
        const fetcher: typeof fetch = async () => new Response(body, { status });
        await assert.rejects(
          transcribe(fixture.path, fetcher),
          (error: unknown) => error instanceof WorkerError && error.code === (status === 429 ? "TRANSCRIPTION_RATE_LIMITED" : "CONFIGURATION_ERROR"),
        );
      };
      await response(429);
      await response(401);
      await response(200, JSON.stringify({ language_code: "en", text: "missing words" }));
    });
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
  assert.deepEqual(classifyWorkerError(new WorkerError("TRANSCRIPTION_UNAVAILABLE", "provider timeout", true)), {
    code: "TRANSCRIPTION_UNAVAILABLE",
    retryable: true,
    message: "provider timeout",
  });
});

test("segment builder keeps long word streams bounded", () => {
  const words = Array.from({ length: 100 }, (_, index) => ({
    startSec: index,
    endSec: index + 0.5,
    text: `word-${index}`,
  }));
  const segments = buildElevenLabsSegments(words);
  assert.ok(segments.length >= 3);
  assert.ok(segments.every((segment) => segment.endSec - segment.startSec <= 15));
});
