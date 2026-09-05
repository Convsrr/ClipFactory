"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction } from "./_generated/server";
import { configuredModelName } from "./lib/aiConfig";
import { CLIP_ANALYSIS_LIMITS, chunkTranscript, postProcessClipCandidates } from "./lib/clipAnalysis";
import { CLIP_DISCOVERY_PROMPT_VERSION } from "./lib/clipDiscoveryPrompt";
import { G0iProvider } from "./lib/aiProvider";

export const analyseProject = internalAction({
  args: { projectId: v.id("projects"), videoId: v.id("videos") },
  returns: v.object({ candidateCount: v.number() }),
  handler: async (ctx, args): Promise<{ candidateCount: number }> => {
    const startedAt = Date.now();
    const transcript = await ctx.runQuery(internal.aiData.transcriptForAnalysis, args);
    let provider: G0iProvider | null = null;
    let providerError: Error | null = null;
    try {
      provider = new G0iProvider();
    } catch (error) {
      providerError = asError(error);
    }

    const maxCandidates = provider?.maxCandidates ?? CLIP_ANALYSIS_LIMITS.defaultMaxCandidates;
    const videoDurationSec = transcript.videoDurationSec ?? inferDuration(transcript.segments);
    const chunks = provider && !transcript.errorMessage
      ? chunkTranscript(transcript.segments, transcript.words, provider.maxTranscriptCharsPerChunk)
      : [];
    const run = await ctx.runMutation(internal.aiData.startAnalysis, {
      projectId: args.projectId,
      transcriptId: transcript.transcriptId,
      provider: provider?.runtimeMetadata.provider ?? "g0i.ai",
      model: provider?.runtimeMetadata.model ?? configuredModelName(),
      promptVersion: CLIP_DISCOVERY_PROMPT_VERSION,
      inputMetadata: {
        videoId: args.videoId,
        segmentCount: transcript.segments.length,
        wordCount: transcript.words.length,
        inputCharacterCount: transcript.segments.reduce((total, segment) => total + segment.text.length, 0),
        chunkCount: chunks.length,
        maxCandidates,
        videoDurationSec,
      },
    });

    if (run.reused) {
      logAnalysis({ projectId: args.projectId, analysisRunId: run.analysisRunId, model: provider?.runtimeMetadata.model ?? configuredModelName(), durationMs: Date.now() - startedAt, candidateCount: run.candidateCount, acceptedCount: run.candidateCount, rejectionCount: 0, status: "reused" });
      return { candidateCount: run.candidateCount };
    }

    let rawCandidateCount = 0;
    let rejectionCount = 0;
    let rawResponseBuffer = "";
    let rawResponseBufferTruncated = false;
    try {
      if (transcript.errorMessage) throw new Error(transcript.errorMessage);
      if (providerError || !provider) throw providerError ?? new Error("g0i.ai is not configured");
      if (!chunks.length) throw new Error("Transcript has no usable timestamped chunks");

      const outputs: Array<Awaited<ReturnType<G0iProvider["analyseTranscriptForClips"]>>> = [];
      for (const [chunkIndex, chunk] of chunks.entries()) {
        const output = await provider.analyseTranscriptForClips({
          chunk,
          maxCandidates,
          videoDurationSec,
          chunkIndex,
          chunkCount: chunks.length,
        });
        outputs.push(output);
        const rawResponse = appendRawResponse(rawResponseBuffer, JSON.stringify({ model: output.model, response: output.raw }), provider.maxRawResponseChars);
        rawResponseBuffer = rawResponse.value;
        rawResponseBufferTruncated ||= rawResponse.truncated;
        rawCandidateCount += output.data.candidates.length;
      }

      const rawCandidates = outputs.flatMap((output) => output.data.candidates);
      const processed = postProcessClipCandidates(rawCandidates, {
        segments: transcript.segments,
        words: transcript.words,
        videoDurationSec,
      }, { maxCandidates });
      rejectionCount = processed.rejected.length;
      const models = [...new Set(outputs.map((output) => output.model))].join(",");
      await ctx.runMutation(internal.aiData.storeAnalysis, {
        analysisRunId: run.analysisRunId,
        projectId: args.projectId,
        videoId: args.videoId,
        model: models || provider.runtimeMetadata.model,
        rawResponse: rawResponseBuffer,
        rawResponseTruncated: rawResponseBufferTruncated,
        candidates: processed.accepted,
        rejectionCount,
        durationMs: Date.now() - startedAt,
      });
      logAnalysis({ projectId: args.projectId, analysisRunId: run.analysisRunId, model: models || provider.runtimeMetadata.model, durationMs: Date.now() - startedAt, candidateCount: rawCandidateCount, acceptedCount: processed.accepted.length, rejectionCount, status: "complete" });
      return { candidateCount: processed.accepted.length };
    } catch (error) {
      const message = analysisErrorMessage(error);
      await ctx.runMutation(internal.aiData.failAnalysis, {
        analysisRunId: run.analysisRunId,
        errorMessage: message,
        durationMs: Date.now() - startedAt,
        ...(rawResponseBuffer ? { rawResponse: rawResponseBuffer, rawResponseTruncated: rawResponseBufferTruncated } : {}),
      });
      logAnalysis({ projectId: args.projectId, analysisRunId: run.analysisRunId, model: provider?.runtimeMetadata.model ?? configuredModelName(), durationMs: Date.now() - startedAt, candidateCount: rawCandidateCount, acceptedCount: 0, rejectionCount, status: "failed", failureReason: message });
      throw new Error(message);
    }
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

function inferDuration(segments: Array<{ endSec: number }>) {
  const duration = segments.reduce((maximum, segment) => Math.max(maximum, segment.endSec), 0);
  return duration > 0 ? duration : null;
}

function appendRawResponse(existing: string, next: string, limit: number) {
  if (existing.length >= limit) return { value: existing, truncated: true };
  const separator = existing ? "\n" : "";
  const available = limit - existing.length - separator.length;
  if (next.length <= available) return { value: existing + separator + next, truncated: false };
  const marker = "\n[raw response truncated]";
  if (available <= marker.length) return { value: existing, truncated: true };
  const contentLimit = Math.max(0, available - marker.length);
  return { value: existing + separator + next.slice(0, contentLimit) + marker, truncated: true };
}

function analysisErrorMessage(error: unknown) {
  return asError(error).message.slice(0, 500);
}

function asError(error: unknown) {
  return error instanceof Error ? error : new Error("Clip analysis failed");
}

function logAnalysis(event: {
  projectId: string;
  analysisRunId: string;
  model: string;
  durationMs: number;
  candidateCount: number;
  acceptedCount: number;
  rejectionCount: number;
  status: "complete" | "failed" | "reused";
  failureReason?: string;
}) {
  console.info(JSON.stringify({ event: "clipfactory.analysis", ...event }));
}
