import { CLIP_ANALYSIS_LIMITS, clipCategoryValues, type TranscriptChunk } from "./clipAnalysis";

export const CLIP_DISCOVERY_PROMPT_VERSION = "clip-discovery-v2";

export const CLIP_DISCOVERY_SYSTEM_PROMPT = `You are an expert short-form video editor selecting moments that can stand alone as compelling vertical videos.

Your job is to find the strongest complete clips, not merely interesting sentences. Prefer a first 1–3 seconds that immediately creates interest, enough setup to understand the point, and an ending that includes the payoff.

Evaluate these signals: strong opening, curiosity, emotional intensity, contrarian opinions, surprising information, useful or educational value, storytelling, conflict or tension, clear payoff, strong statements, humour, relatability, specificity, novelty, shareability, standalone context, sentence completeness, and first-three-second potential.

Reject or avoid greetings, introductions, sponsor reads, dead air, rambling, incomplete thoughts, filler, clips that need excessive external context, duplicate moments, clips that start too early, and clips that end before the payoff. Do not invent facts, people, statistics, quotes, or words that are not supported by the transcript.

Use the supplied segment and word timestamps to choose natural beginnings and endings. Prefer sentence boundaries and pauses when they preserve the hook and payoff. Timestamps are global video seconds, not positions inside this chunk.

Return JSON only. Use the exact top-level key \`clips\`. Return no more than the requested number of candidates. If there are no genuinely strong standalone moments, return an empty clips array.`;

export function buildClipDiscoveryPrompt({ chunk, maxCandidates, videoDurationSec, chunkIndex, chunkCount, maxTranscriptChars }: {
  chunk: TranscriptChunk;
  maxCandidates: number;
  videoDurationSec: number | null;
  chunkIndex: number;
  chunkCount: number;
  maxTranscriptChars: number;
}) {
  const segments = boundedBlock(chunk.segments.map((segment) => `[${formatSeconds(segment.startSec)}-${formatSeconds(segment.endSec)}] ${segment.text}`), Math.floor(maxTranscriptChars / 2));
  const words = chunk.words.length
    ? boundedBlock(chunk.words.map((word) => `[${formatSeconds(word.startSec)}-${formatSeconds(word.endSec)}] ${word.text}`), Math.ceil(maxTranscriptChars / 2), " ")
    : "No word-level timestamps are available; use segment boundaries.";
  const duration = videoDurationSec === null ? "unknown" : formatSeconds(videoDurationSec);

  return `Analyse transcript chunk ${chunkIndex + 1} of ${chunkCount}. The complete video duration is ${duration} seconds. Return at most ${maxCandidates} candidates.

For every candidate return:
{
  "startSec": number,
  "endSec": number,
  "score": number from 0 to 100 (a model estimate only),
  "confidence": number from 0 to 1,
  "hook": "concise on-screen hook faithful to the transcript",
  "title": "short discovery title",
  "description": "one or two accurate social sentences",
  "summary": "brief factual summary",
  "reason": "why this moment works as a standalone short",
  "category": one of [${clipCategoryValues.join(", ")}],
  "transcriptExcerpt": "exact words from the supplied transcript",
  "dimensions": {
    "hookStrength": number from 0 to 100,
    "emotionalImpact": number from 0 to 100,
    "curiosity": number from 0 to 100,
    "value": number from 0 to 100,
    "storytelling": number from 0 to 100,
    "novelty": number from 0 to 100,
    "standaloneContext": number from 0 to 100,
    "payoff": number from 0 to 100,
    "shareability": number from 0 to 100
  }
}

Transcript segments:
${segments}

Word timestamps:
${words}

Use only the transcript as evidence. Keep clips between ${CLIP_ANALYSIS_LIMITS.minDurationSec} and ${CLIP_ANALYSIS_LIMITS.maxDurationSec} seconds where possible, with a preferred range of ${CLIP_ANALYSIS_LIMITS.preferredMinDurationSec}–${CLIP_ANALYSIS_LIMITS.preferredMaxDurationSec} seconds. Do not return markdown or additional keys.`;
}

function formatSeconds(value: number) {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function boundedBlock(lines: string[], maxChars: number, separator = "\n") {
  const content = lines.join(separator);
  if (content.length <= maxChars) return content;
  const marker = separator === " " ? " ... [timestamps truncated] ... " : "\n... [timestamps truncated] ...\n";
  if (maxChars <= marker.length) return content.slice(0, maxChars);
  const available = maxChars - marker.length;
  const headLength = Math.ceil(available / 2);
  const tailLength = available - headLength;
  return content.slice(0, headLength) + marker + content.slice(-tailLength);
}
