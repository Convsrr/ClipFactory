"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction } from "./_generated/server";
import { G0iProvider, type ClipCandidate } from "./lib/aiProvider";

export const analyseProject = internalAction({
  args: { projectId: v.id("projects"), videoId: v.id("videos") },
  returns: v.object({ candidateCount: v.number() }),
  handler: async (ctx, args): Promise<{ candidateCount: number }> => {
    const transcript = await ctx.runQuery(internal.aiData.transcriptForAnalysis, args);
    const chunks = chunkSegments(transcript.segments, 12_000);
    const provider = new G0iProvider();
    const outputs = await Promise.all(chunks.map((chunk) => provider.analyseTranscriptForClips(chunk)));
    const filtered = filterCandidates(outputs.flatMap((output) => output.data.candidates));
    await ctx.runMutation(internal.aiData.storeAnalysis, { projectId: args.projectId, videoId: args.videoId, transcriptId: transcript.transcriptId, model: outputs[0]?.model ?? process.env.G0I_MODEL_ANALYSIS ?? "unknown", rawResponse: outputs.map((output) => output.raw).join("\n"), candidates: filtered });
    return { candidateCount: filtered.length };
  },
});

export const regenerateMetadata = action({
  args: { clipId: v.string(), field: v.union(v.literal("hook"), v.literal("title"), v.literal("description")) },
  returns: v.object({ value: v.string() }),
  handler: async (ctx, args): Promise<{ value: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Authentication required");
    const clip = await ctx.runQuery(internal.aiData.clipForRegeneration, { clipId: args.clipId });
    if (!clip || clip.userId !== userId) throw new Error("Clip not found");
    const provider = new G0iProvider();
    let value: string;
    if (args.field === "hook") value = (await provider.generateHooks(clip)).data.hooks[0];
    else if (args.field === "title") value = (await provider.generateClipTitle(clip)).data.title;
    else value = (await provider.generateClipDescription(clip)).data.description;
    await ctx.runMutation(internal.clips.updateGeneratedMetadata, { clipId: args.clipId, field: args.field, value });
    return { value };
  },
});

function chunkSegments(segments: Array<{ startSec: number; endSec: number; text: string }>, maxChars: number) {
  const chunks: typeof segments[] = [];
  let chunk: typeof segments = [];
  let length = 0;
  for (const segment of segments) {
    if (chunk.length && length + segment.text.length > maxChars) {
      chunks.push(chunk);
      chunk = [];
      length = 0;
    }
    chunk.push(segment);
    length += segment.text.length;
  }
  if (chunk.length) chunks.push(chunk);
  return chunks;
}

function filterCandidates(candidates: ClipCandidate[]) {
  const sorted = candidates
    .filter((candidate) => candidate.endSec > candidate.startSec && candidate.endSec - candidate.startSec >= 15 && candidate.endSec - candidate.startSec <= 75)
    .map((candidate) => ({ ...candidate, score: Math.max(0, Math.min(100, candidate.score - durationPenalty(candidate.endSec - candidate.startSec))) }))
    .sort((a, b) => b.score - a.score);
  const selected: ClipCandidate[] = [];
  for (const candidate of sorted) {
    const overlaps = selected.some((current) => overlapRatio(candidate, current) > 0.35);
    if (!overlaps) selected.push(candidate);
    if (selected.length === 8) break;
  }
  return selected;
}

function durationPenalty(duration: number) {
  if (duration >= 20 && duration <= 60) return 0;
  return 8;
}

function overlapRatio(a: Pick<ClipCandidate, "startSec" | "endSec">, b: Pick<ClipCandidate, "startSec" | "endSec">) {
  const overlap = Math.max(0, Math.min(a.endSec, b.endSec) - Math.max(a.startSec, b.startSec));
  return overlap / Math.min(a.endSec - a.startSec, b.endSec - b.startSec);
}
