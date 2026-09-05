import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateFinalScore,
  chunkTranscript,
  parseClipAnalysisJson,
  parseClipAnalysisResponse,
  postProcessClipCandidates,
  type ClipCandidate,
  type TranscriptInput,
} from "../convex/lib/clipAnalysis";
import { buildClipDiscoveryPrompt } from "../convex/lib/clipDiscoveryPrompt";

const dimensions = {
  hookStrength: 80,
  emotionalImpact: 70,
  curiosity: 85,
  value: 75,
  storytelling: 65,
  novelty: 60,
  standaloneContext: 90,
  payoff: 80,
  shareability: 70,
};

function candidate(overrides: Partial<ClipCandidate> = {}) {
  return {
    startSec: 20,
    endSec: 60,
    score: 91,
    confidence: 0.9,
    hook: "The useful part nobody expects",
    title: "The useful part nobody expects",
    description: "A concise explanation grounded in the transcript.",
    summary: "The speaker explains a specific, useful point.",
    reason: "It opens with a clear claim and lands a complete payoff.",
    category: "educational" as const,
    transcriptExcerpt: "Ignored by post-processing in favour of timestamped transcript text.",
    dimensions,
    ...overrides,
  } satisfies ClipCandidate;
}

function transcript(videoDurationSec: number | null = 180): TranscriptInput {
  return {
    videoDurationSec,
    segments: [{ startSec: 0, endSec: videoDurationSec ?? 180, text: "The speaker explains a specific useful point with enough context to stand alone." }],
    words: [],
  };
}

test("valid AI response parses with the clips contract", () => {
  const parsed = parseClipAnalysisResponse({ clips: [candidate()] });
  assert.equal(parsed.candidates.length, 1);
  assert.equal(parsed.candidates[0]?.category, "educational");
});

test("invalid JSON is rejected", () => {
  assert.throws(() => parseClipAnalysisJson("{not-json"), /invalid JSON/);
});

test("end at or before start is rejected by the schema", () => {
  assert.throws(() => parseClipAnalysisResponse({ clips: [candidate({ startSec: 30, endSec: 30 })] }), /endSec must be greater/);
});

test("timestamps are clamped to the known video duration", () => {
  const result = postProcessClipCandidates([candidate({ startSec: -10, endSec: 250 }) as ClipCandidate], transcript(120));
  assert.equal(result.accepted[0]?.startSec, 0);
  assert.equal(result.accepted[0]?.endSec, 75);
});

test("minimum duration rejects short candidates and maximum duration is enforced", () => {
  const result = postProcessClipCandidates([
    candidate({ startSec: 0, endSec: 10 }),
    candidate({ startSec: 0, endSec: 140, score: 80 }),
  ], transcript(180));
  assert.equal(result.accepted.length, 1);
  assert.equal(result.accepted[0]?.durationSec, 75);
  assert.ok(result.rejected.some((item) => item.reason === "too_short"));
});

test("scores are bounded and the application score uses validated dimensions", () => {
  assert.throws(() => parseClipAnalysisResponse({ clips: [candidate({ score: 101 })] }), /Too big|less than or equal/);
  assert.equal(calculateFinalScore({ dimensions, confidence: 1 }, 40), 78);
  assert.ok(calculateFinalScore({ dimensions: { ...dimensions, hookStrength: 0 }, confidence: 0 }, 40) < 78);
  assert.ok(calculateFinalScore({ dimensions, confidence: 1 }, 40) <= 100);
});

test("heavily overlapping candidates keep the stronger clip", () => {
  const result = postProcessClipCandidates([
    candidate({ startSec: 20, endSec: 60, score: 70 }),
    candidate({ startSec: 23, endSec: 63, score: 95, dimensions: { ...dimensions, hookStrength: 100 } }),
    candidate({ startSec: 100, endSec: 140, score: 80 }),
  ], transcript(180));
  assert.deepEqual(result.accepted.map((item) => item.startSec), [23, 100]);
  assert.ok(result.rejected.some((item) => item.reason === "duplicate_overlap"));
});

test("transcript similarity filters a partially overlapping duplicate", () => {
  const result = postProcessClipCandidates([
    candidate({ startSec: 20, endSec: 60, score: 95 }),
    candidate({ startSec: 50, endSec: 90, score: 80 }),
  ], transcript(180));
  assert.equal(result.accepted.length, 1);
  assert.ok(result.rejected.some((item) => item.reason === "duplicate_transcript"));
});

test("word timestamps guide natural boundaries and exact excerpts", () => {
  const input: TranscriptInput = {
    videoDurationSec: 90,
    segments: [{ startSec: 0, endSec: 90, text: "The complete source sentence." }],
    words: [
      { startSec: 20, endSec: 21, text: "Natural" },
      { startSec: 21, endSec: 22, text: "opening" },
      { startSec: 58, endSec: 59, text: "clear" },
      { startSec: 59, endSec: 60, text: "payoff" },
    ],
  };
  const result = postProcessClipCandidates([candidate({ startSec: 20.4, endSec: 59.6 })], input);
  assert.equal(result.accepted[0]?.startSec, 20);
  assert.equal(result.accepted[0]?.endSec, 60);
  assert.equal(result.accepted[0]?.transcriptExcerpt, "Natural opening clear payoff");
});

test("large transcripts are chunked with bounded character payloads", () => {
  const segments = Array.from({ length: 8 }, (_, index) => ({ startSec: index * 10, endSec: index * 10 + 9, text: `segment-${index}` }));
  const chunks = chunkTranscript(segments, [], 24, 1);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.characterCount <= 24));
});

test("word timestamp prompts stay bounded for large word payloads", () => {
  const chunk = chunkTranscript(
    [{ startSec: 0, endSec: 60, text: "A short segment with useful context." }],
    Array.from({ length: 2_000 }, (_, index) => ({ startSec: index * 0.02, endSec: index * 0.02 + 0.01, text: `word-${index}` })),
    2_000,
  )[0];
  assert.ok(chunk);
  const prompt = buildClipDiscoveryPrompt({ chunk, maxCandidates: 8, videoDurationSec: 60, chunkIndex: 0, chunkCount: 1, maxTranscriptChars: 2_000 });
  assert.ok(prompt.includes("timestamps truncated"));
  assert.ok(prompt.length < 8_000);
});

test("missing transcript duration fails with a clear error", () => {
  assert.throws(() => postProcessClipCandidates([], { segments: [], words: [], videoDurationSec: null }), /usable duration/);
});
