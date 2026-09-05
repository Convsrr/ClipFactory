import { z } from "zod";

const finiteNumber = z.number().finite();
const boundedScore = finiteNumber.min(0).max(100);

export const clipCategoryValues = [
  "story",
  "educational",
  "opinion",
  "controversy",
  "humour",
  "motivational",
  "how_to",
  "insight",
  "reaction",
  "interview",
  "news",
  "other",
] as const;

export const clipCategorySchema = z.enum(clipCategoryValues);

export const clipScoreDimensionsSchema = z.object({
  hookStrength: boundedScore,
  emotionalImpact: boundedScore,
  curiosity: boundedScore,
  value: boundedScore,
  storytelling: boundedScore,
  novelty: boundedScore,
  standaloneContext: boundedScore,
  payoff: boundedScore,
  shareability: boundedScore,
}).strict();

export const clipCandidateSchema = z.object({
  startSec: finiteNumber.nonnegative(),
  endSec: finiteNumber.nonnegative(),
  score: boundedScore,
  confidence: z.number().finite().min(0).max(1),
  hook: boundedText(180),
  title: boundedText(120),
  description: boundedText(500),
  summary: boundedText(500),
  reason: boundedText(400),
  category: clipCategorySchema,
  transcriptExcerpt: boundedText(800),
  dimensions: clipScoreDimensionsSchema,
}).strict().superRefine((candidate, context) => {
  if (candidate.endSec <= candidate.startSec) {
    context.addIssue({ code: "custom", path: ["endSec"], message: "endSec must be greater than startSec" });
  }
});

const candidateArraySchema = z.array(clipCandidateSchema).max(50);

export const clipAnalysisResponseSchema = z.object({
  clips: candidateArraySchema.optional(),
  candidates: candidateArraySchema.optional(),
}).strict().superRefine((response, context) => {
  if (response.clips === undefined && response.candidates === undefined) {
    context.addIssue({ code: "custom", path: ["clips"], message: "response must include clips" });
  }
  if (response.clips !== undefined && response.candidates !== undefined) {
    context.addIssue({ code: "custom", path: ["clips"], message: "use either clips or candidates, not both" });
  }
});

export type ClipCandidate = z.infer<typeof clipCandidateSchema>;
export type ClipScoreDimensions = z.infer<typeof clipScoreDimensionsSchema>;
export type TranscriptSegment = { startSec: number; endSec: number; text: string; speaker?: string };
export type TranscriptWord = { startSec: number; endSec: number; text: string; confidence?: number };
export type TranscriptInput = {
  segments: TranscriptSegment[];
  words?: TranscriptWord[];
  videoDurationSec?: number | null;
};

export const CLIP_ANALYSIS_LIMITS = {
  minDurationSec: 15,
  maxDurationSec: 75,
  preferredMinDurationSec: 20,
  preferredMaxDurationSec: 60,
  defaultMaxCandidates: 8,
  maxAllowedCandidates: 20,
  duplicateOverlapRatio: 0.65,
  duplicateTextSimilarity: 0.84,
  duplicateTextMinOverlapRatio: 0.2,
  boundarySnapToleranceSec: 2.5,
} as const;

/**
 * These weights are deliberately centralized so product tuning does not leak
 * into the UI or the provider client. The model's own total score is not used.
 */
export const SCORE_WEIGHTS = {
  hookStrength: 0.14,
  emotionalImpact: 0.08,
  curiosity: 0.12,
  value: 0.12,
  storytelling: 0.10,
  novelty: 0.09,
  standaloneContext: 0.12,
  payoff: 0.11,
  shareability: 0.06,
  confidence: 0.04,
  durationFit: 0.02,
} as const;

export type FinalScoreBreakdown = ClipScoreDimensions & {
  confidence: number;
  durationFit: number;
};

export type NormalizedClipCandidate = Omit<ClipCandidate, "score" | "transcriptExcerpt"> & {
  startSec: number;
  endSec: number;
  durationSec: number;
  score: number;
  modelScore: number;
  transcriptExcerpt: string;
  scoreBreakdown: FinalScoreBreakdown;
};

export type CandidateRejection = {
  index: number;
  reason: "invalid_timestamp" | "invalid_range" | "too_short" | "no_transcript_text" | "duplicate_overlap" | "duplicate_transcript" | "max_candidates";
};

export type PostProcessResult = {
  accepted: NormalizedClipCandidate[];
  rejected: CandidateRejection[];
  videoDurationSec: number;
};

export type TranscriptChunk = {
  segments: TranscriptSegment[];
  words: TranscriptWord[];
  characterCount: number;
};

export function parseClipAnalysisResponse(value: unknown) {
  const parsed = clipAnalysisResponseSchema.parse(value);
  return { candidates: parsed.clips ?? parsed.candidates ?? [] };
}

export function parseClipAnalysisJson(raw: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("g0i.ai returned invalid JSON");
  }
  return parseClipAnalysisResponse(parsed);
}

export function calculateFinalScore(candidate: Pick<ClipCandidate, "dimensions" | "confidence">, durationSec: number) {
  const breakdown = calculateScoreBreakdown(candidate, durationSec);
  const weightedScore = (
    breakdown.hookStrength * SCORE_WEIGHTS.hookStrength
    + breakdown.emotionalImpact * SCORE_WEIGHTS.emotionalImpact
    + breakdown.curiosity * SCORE_WEIGHTS.curiosity
    + breakdown.value * SCORE_WEIGHTS.value
    + breakdown.storytelling * SCORE_WEIGHTS.storytelling
    + breakdown.novelty * SCORE_WEIGHTS.novelty
    + breakdown.standaloneContext * SCORE_WEIGHTS.standaloneContext
    + breakdown.payoff * SCORE_WEIGHTS.payoff
    + breakdown.shareability * SCORE_WEIGHTS.shareability
    + breakdown.confidence * SCORE_WEIGHTS.confidence
    + breakdown.durationFit * SCORE_WEIGHTS.durationFit
  );
  return clamp(Math.round(weightedScore), 0, 100);
}

export function calculateScoreBreakdown(candidate: Pick<ClipCandidate, "dimensions" | "confidence">, durationSec: number): FinalScoreBreakdown {
  return {
    ...candidate.dimensions,
    confidence: clamp(Math.round(candidate.confidence * 100), 0, 100),
    durationFit: durationFitScore(durationSec),
  };
}

export function postProcessClipCandidates(
  candidates: readonly ClipCandidate[],
  transcript: TranscriptInput,
  options: { maxCandidates?: number } = {},
): PostProcessResult {
  const videoDurationSec = resolveVideoDuration(transcript);
  const maxCandidates = clamp(
    Math.trunc(options.maxCandidates ?? CLIP_ANALYSIS_LIMITS.defaultMaxCandidates),
    1,
    CLIP_ANALYSIS_LIMITS.maxAllowedCandidates,
  );
  const boundaries = transcriptBoundaries(transcript);
  const rejected: CandidateRejection[] = [];
  const normalized: Array<{ index: number; candidate: NormalizedClipCandidate }> = [];

  candidates.forEach((candidate, index) => {
    if (!hasValidTimestamps(candidate)) {
      rejected.push({ index, reason: "invalid_timestamp" });
      return;
    }
    if (candidate.endSec <= candidate.startSec) {
      rejected.push({ index, reason: "invalid_range" });
      return;
    }

    let startSec = clamp(candidate.startSec, 0, videoDurationSec);
    let endSec = clamp(candidate.endSec, 0, videoDurationSec);
    if (endSec <= startSec) {
      rejected.push({ index, reason: "invalid_range" });
      return;
    }

    startSec = snapBoundary(startSec, boundaries.starts);
    endSec = snapBoundary(endSec, boundaries.ends);
    if (endSec <= startSec) {
      rejected.push({ index, reason: "invalid_range" });
      return;
    }
    ({ startSec, endSec } = enforceMaximumDuration(startSec, endSec, videoDurationSec));
    const durationSec = roundSeconds(endSec - startSec);
    if (durationSec < CLIP_ANALYSIS_LIMITS.minDurationSec) {
      rejected.push({ index, reason: "too_short" });
      return;
    }
    if (durationSec <= 0) {
      rejected.push({ index, reason: "invalid_range" });
      return;
    }

    const transcriptExcerpt = excerptForRange(transcript, startSec, endSec);
    if (!transcriptExcerpt) {
      rejected.push({ index, reason: "no_transcript_text" });
      return;
    }

    normalized.push({
      index,
      candidate: {
        ...candidate,
        startSec: roundSeconds(startSec),
        endSec: roundSeconds(endSec),
        durationSec,
        modelScore: candidate.score,
        score: calculateFinalScore(candidate, durationSec),
        transcriptExcerpt,
        scoreBreakdown: calculateScoreBreakdown(candidate, durationSec),
      },
    });
  });

  normalized.sort((a, b) => b.candidate.score - a.candidate.score || a.candidate.startSec - b.candidate.startSec);
  const accepted: NormalizedClipCandidate[] = [];
  for (const item of normalized) {
    if (accepted.length >= maxCandidates) {
      rejected.push({ index: item.index, reason: "max_candidates" });
      continue;
    }
    const duplicate = accepted.find((current) => duplicateKind(item.candidate, current));
    if (duplicate) {
      rejected.push({ index: item.index, reason: duplicateKind(item.candidate, duplicate) === "overlap" ? "duplicate_overlap" : "duplicate_transcript" });
      continue;
    }
    accepted.push(item.candidate);
  }

  return { accepted, rejected, videoDurationSec };
}

export function chunkTranscript(
  segments: readonly TranscriptSegment[],
  words: readonly TranscriptWord[] = [],
  maxChars: number,
  overlapSegments = 1,
): TranscriptChunk[] {
  if (!Number.isFinite(maxChars) || maxChars < 1) throw new Error("maxChars must be positive");
  const pieces = segments.flatMap((segment) => splitOversizedSegment(segment, Math.trunc(maxChars)));
  const chunks: TranscriptSegment[][] = [];
  let current: TranscriptSegment[] = [];
  let currentChars = 0;

  for (const piece of pieces) {
    const pieceChars = piece.text.length;
    if (current.length && currentChars + pieceChars > maxChars) {
      chunks.push(current);
      const overlap = current.slice(-Math.max(0, overlapSegments));
      currentChars = overlap.reduce((total, segment) => total + segment.text.length, 0);
      current = currentChars + pieceChars <= maxChars ? overlap : [];
      if (!current.length) currentChars = 0;
    }
    current.push(piece);
    currentChars += pieceChars;
  }
  if (current.length) chunks.push(current);

  return chunks.map((chunk) => {
    const startSec = chunk.reduce((minimum, segment) => Math.min(minimum, segment.startSec), Number.POSITIVE_INFINITY);
    const endSec = chunk.reduce((maximum, segment) => Math.max(maximum, segment.endSec), 0);
    return {
      segments: chunk,
      words: words.filter((word) => word.endSec > startSec && word.startSec < endSec),
      characterCount: chunk.reduce((total, segment) => total + segment.text.length, 0),
    };
  });
}

export function overlapRatio(
  a: Pick<NormalizedClipCandidate, "startSec" | "endSec">,
  b: Pick<NormalizedClipCandidate, "startSec" | "endSec">,
) {
  const overlap = Math.max(0, Math.min(a.endSec, b.endSec) - Math.max(a.startSec, b.startSec));
  const shorterDuration = Math.min(a.endSec - a.startSec, b.endSec - b.startSec);
  return shorterDuration > 0 ? overlap / shorterDuration : 0;
}

export function transcriptSimilarity(a: string, b: string) {
  const left = new Set(tokens(a));
  const right = new Set(tokens(b));
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

function durationFitScore(durationSec: number) {
  if (durationSec >= CLIP_ANALYSIS_LIMITS.preferredMinDurationSec && durationSec <= CLIP_ANALYSIS_LIMITS.preferredMaxDurationSec) return 100;
  if (durationSec < CLIP_ANALYSIS_LIMITS.preferredMinDurationSec) {
    return clamp(Math.round(60 + ((durationSec - CLIP_ANALYSIS_LIMITS.minDurationSec) / 5) * 40), 0, 100);
  }
  return clamp(Math.round(100 - ((durationSec - CLIP_ANALYSIS_LIMITS.preferredMaxDurationSec) / 15) * 40), 0, 100);
}

function resolveVideoDuration(transcript: TranscriptInput) {
  const configuredDuration = transcript.videoDurationSec;
  if (configuredDuration !== null && configuredDuration !== undefined && Number.isFinite(configuredDuration) && configuredDuration > 0) return configuredDuration;
  const timestamps = [
    ...transcript.segments.map((segment) => segment.endSec),
    ...(transcript.words ?? []).map((word) => word.endSec),
  ].filter((value) => Number.isFinite(value) && value > 0);
  const duration = timestamps.reduce((maximum, timestamp) => Math.max(maximum, timestamp), 0);
  if (!duration) throw new Error("Transcript has no usable duration");
  return duration;
}

function transcriptBoundaries(transcript: TranscriptInput) {
  const starts = [
    ...transcript.segments.map((segment) => segment.startSec),
    ...(transcript.words ?? []).map((word) => word.startSec),
  ].filter((value) => Number.isFinite(value));
  const ends = [
    ...transcript.segments.map((segment) => segment.endSec),
    ...(transcript.words ?? []).map((word) => word.endSec),
  ].filter((value) => Number.isFinite(value));
  return { starts: uniqueSorted(starts), ends: uniqueSorted(ends) };
}

function snapBoundary(value: number, boundaries: number[]) {
  let nearest = value;
  let distance: number = CLIP_ANALYSIS_LIMITS.boundarySnapToleranceSec;
  for (const boundary of boundaries) {
    const candidateDistance = Math.abs(boundary - value);
    if (candidateDistance <= distance) {
      nearest = boundary;
      distance = candidateDistance;
    }
  }
  return nearest;
}

function enforceMaximumDuration(startSec: number, endSec: number, videoDurationSec: number) {
  if (endSec - startSec <= CLIP_ANALYSIS_LIMITS.maxDurationSec) return { startSec, endSec };
  if (startSec + CLIP_ANALYSIS_LIMITS.maxDurationSec <= videoDurationSec) {
    return { startSec, endSec: startSec + CLIP_ANALYSIS_LIMITS.maxDurationSec };
  }
  return { startSec: Math.max(0, videoDurationSec - CLIP_ANALYSIS_LIMITS.maxDurationSec), endSec: videoDurationSec };
}

function excerptForRange(transcript: TranscriptInput, startSec: number, endSec: number) {
  const words = (transcript.words ?? []).filter((word) => word.endSec > startSec && word.startSec < endSec && word.text.trim());
  const source = words.length ? words.map((word) => word.text) : transcript.segments.filter((segment) => segment.endSec > startSec && segment.startSec < endSec).map((segment) => segment.text);
  return source.join(" ").replace(/\s+/g, " ").trim().slice(0, 800);
}

function duplicateKind(a: NormalizedClipCandidate, b: NormalizedClipCandidate) {
  if (overlapRatio(a, b) >= CLIP_ANALYSIS_LIMITS.duplicateOverlapRatio) return "overlap" as const;
  if (overlapRatio(a, b) >= CLIP_ANALYSIS_LIMITS.duplicateTextMinOverlapRatio && transcriptSimilarity(a.transcriptExcerpt, b.transcriptExcerpt) >= CLIP_ANALYSIS_LIMITS.duplicateTextSimilarity) return "transcript" as const;
  return false;
}

function hasValidTimestamps(candidate: Pick<ClipCandidate, "startSec" | "endSec">) {
  return Number.isFinite(candidate.startSec) && Number.isFinite(candidate.endSec);
}

function splitOversizedSegment(segment: TranscriptSegment, maxChars: number) {
  if (segment.text.length <= maxChars) return [segment];
  const parts: TranscriptSegment[] = [];
  let remaining = segment.text.trim();
  while (remaining) {
    let end = Math.min(maxChars, remaining.length);
    if (end < remaining.length) {
      const whitespace = remaining.lastIndexOf(" ", end);
      if (whitespace > 0) end = whitespace;
    }
    const text = remaining.slice(0, end).trim();
    if (text) parts.push({ ...segment, text });
    remaining = remaining.slice(end).trimStart();
  }
  return parts;
}

function tokens(value: string) {
  return value.toLowerCase().match(/[a-z0-9']+/g)?.filter((token) => token.length > 1) ?? [];
}

function uniqueSorted(values: number[]) {
  return [...new Set(values)].sort((a, b) => a - b);
}

function boundedText(maxLength: number) {
  return z.string().trim().min(1).max(maxLength);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundSeconds(value: number) {
  return Math.round(value * 100) / 100;
}
