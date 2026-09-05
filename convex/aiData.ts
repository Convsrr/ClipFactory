import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const scoreDimensionsValidator = v.object({
  hookStrength: v.number(),
  emotionalImpact: v.number(),
  curiosity: v.number(),
  value: v.number(),
  storytelling: v.number(),
  novelty: v.number(),
  standaloneContext: v.number(),
  payoff: v.number(),
  shareability: v.number(),
});

const scoreBreakdownValidator = v.object({
  hookStrength: v.number(),
  emotionalImpact: v.number(),
  curiosity: v.number(),
  value: v.number(),
  storytelling: v.number(),
  novelty: v.number(),
  standaloneContext: v.number(),
  payoff: v.number(),
  shareability: v.number(),
  confidence: v.number(),
  durationFit: v.number(),
});

const categoryValidator = v.union(
  v.literal("story"),
  v.literal("educational"),
  v.literal("opinion"),
  v.literal("controversy"),
  v.literal("humour"),
  v.literal("motivational"),
  v.literal("how_to"),
  v.literal("insight"),
  v.literal("reaction"),
  v.literal("interview"),
  v.literal("news"),
  v.literal("other"),
);

const candidateValidator = v.object({
  startSec: v.number(),
  endSec: v.number(),
  durationSec: v.number(),
  score: v.number(),
  modelScore: v.number(),
  confidence: v.number(),
  hook: v.string(),
  title: v.string(),
  description: v.string(),
  reason: v.string(),
  summary: v.string(),
  category: categoryValidator,
  transcriptExcerpt: v.string(),
  dimensions: scoreDimensionsValidator,
  scoreBreakdown: scoreBreakdownValidator,
});

const inputMetadataValidator = v.object({
  videoId: v.id("videos"),
  segmentCount: v.number(),
  wordCount: v.number(),
  inputCharacterCount: v.number(),
  chunkCount: v.number(),
  maxCandidates: v.number(),
  videoDurationSec: v.union(v.number(), v.null()),
});

const transcriptSegmentValidator = v.object({ startSec: v.number(), endSec: v.number(), text: v.string(), speaker: v.optional(v.string()) });
const transcriptWordValidator = v.object({ startSec: v.number(), endSec: v.number(), text: v.string(), confidence: v.optional(v.number()) });

export const transcriptForAnalysis = internalQuery({
  args: { projectId: v.id("projects"), videoId: v.id("videos") },
  returns: v.object({
    transcriptId: v.union(v.id("transcripts"), v.null()),
    userId: v.id("users"),
    segments: v.array(transcriptSegmentValidator),
    words: v.array(transcriptWordValidator),
    videoDurationSec: v.union(v.number(), v.null()),
    errorMessage: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const [project, video] = await Promise.all([ctx.db.get(args.projectId), ctx.db.get(args.videoId)]);
    if (!project) throw new Error("Project not found");
    if (!video || video.projectId !== project._id) throw new Error("Video does not belong to project");
    const transcripts = await ctx.db.query("transcripts").withIndex("by_videoId", (q) => q.eq("videoId", args.videoId)).order("desc").take(1);
    const transcript = transcripts[0];
    if (!transcript) return emptyAnalysisInput(project.userId, video.durationSec ?? null, "Transcript is not ready for analysis");
    if (transcript.status !== "complete") return emptyAnalysisInput(project.userId, video.durationSec ?? null, `Transcript is ${transcript.status}`);
    if (!transcript.segments.length) return emptyAnalysisInput(project.userId, video.durationSec ?? null, "Transcript has no timestamped segments");
    return {
      transcriptId: transcript._id,
      userId: project.userId,
      segments: transcript.segments,
      words: transcript.words ?? [],
      videoDurationSec: video.durationSec ?? null,
      errorMessage: null,
    };
  },
});

export const clipForRegeneration = internalQuery({
  args: { clipId: v.string() },
  returns: v.union(v.object({ userId: v.id("users"), hook: v.string(), title: v.string(), transcriptExcerpt: v.string() }), v.null()),
  handler: async (ctx, args) => {
    const clipId = ctx.db.normalizeId("clips", args.clipId);
    if (!clipId) return null;
    const clip = await ctx.db.get(clipId);
    if (!clip) return null;
    return { userId: clip.userId, hook: clip.hook, title: clip.title, transcriptExcerpt: clip.transcriptExcerpt };
  },
});

export const startAnalysis = internalMutation({
  args: {
    projectId: v.id("projects"),
    transcriptId: v.union(v.id("transcripts"), v.null()),
    provider: v.string(),
    model: v.string(),
    promptVersion: v.string(),
    inputMetadata: inputMetadataValidator,
  },
  returns: v.object({ analysisRunId: v.id("analysisRuns"), reused: v.boolean(), candidateCount: v.number() }),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");
    if (args.transcriptId) {
      const previousRuns = await ctx.db.query("analysisRuns").withIndex("by_projectId", (q) => q.eq("projectId", args.projectId)).order("desc").take(20);
      const previous = previousRuns.find((run) => run.status === "complete" && run.transcriptId === args.transcriptId && run.promptVersion === args.promptVersion);
      if (previous) return { analysisRunId: previous._id, reused: true, candidateCount: previous.acceptedCount ?? previous.parsedOutput.length };
    }

    const now = Date.now();
    const base = {
      projectId: args.projectId,
      provider: args.provider,
      model: args.model,
      promptVersion: args.promptVersion,
      inputMetadata: args.inputMetadata,
      parsedOutput: [],
      status: "running" as const,
      createdAt: now,
      updatedAt: now,
    };
    const analysisRunId = args.transcriptId
      ? await ctx.db.insert("analysisRuns", { ...base, transcriptId: args.transcriptId })
      : await ctx.db.insert("analysisRuns", base);
    return { analysisRunId, reused: false, candidateCount: 0 };
  },
});

export const storeAnalysis = internalMutation({
  args: {
    analysisRunId: v.id("analysisRuns"),
    projectId: v.id("projects"),
    videoId: v.id("videos"),
    model: v.string(),
    rawResponse: v.string(),
    rawResponseTruncated: v.boolean(),
    candidates: v.array(candidateValidator),
    rejectionCount: v.number(),
    durationMs: v.number(),
  },
  returns: v.array(v.id("clips")),
  handler: async (ctx, args) => {
    const [project, run, video] = await Promise.all([ctx.db.get(args.projectId), ctx.db.get(args.analysisRunId), ctx.db.get(args.videoId)]);
    if (!project) throw new Error("Project not found");
    if (!video || video.projectId !== project._id) throw new Error("Video does not belong to project");
    if (!run || run.projectId !== project._id) throw new Error("Analysis run does not belong to project");
    if (run.status === "complete") {
      const existing = await ctx.db.query("clips").withIndex("by_analysisRunId", (q) => q.eq("analysisRunId", args.analysisRunId)).take(20);
      return existing.map((clip) => clip._id);
    }

    const now = Date.now();
    await ctx.db.patch(args.analysisRunId, {
      model: args.model,
      rawResponse: args.rawResponse,
      rawResponseTruncated: args.rawResponseTruncated,
      parsedOutput: args.candidates,
      status: "complete",
      candidateCount: args.candidates.length,
      acceptedCount: args.candidates.length,
      rejectionCount: args.rejectionCount,
      durationMs: args.durationMs,
      completedAt: now,
      updatedAt: now,
    });

    const clipIds: Array<Id<"clips">> = [];
    for (const candidate of args.candidates) {
      clipIds.push(await ctx.db.insert("clips", {
        projectId: args.projectId,
        videoId: args.videoId,
        userId: project.userId,
        analysisRunId: args.analysisRunId,
        startSec: candidate.startSec,
        endSec: candidate.endSec,
        durationSec: candidate.durationSec,
        score: Math.round(candidate.score),
        confidence: candidate.confidence,
        scoreBreakdown: candidate.scoreBreakdown,
        title: candidate.title,
        hook: candidate.hook,
        description: candidate.description,
        summary: candidate.summary,
        reason: candidate.reason,
        category: candidate.category,
        transcriptExcerpt: candidate.transcriptExcerpt,
        aspectRatio: "9:16",
        status: "queued",
        captionPresetKey: "bold-viral",
        createdAt: now,
        updatedAt: now,
      }));
    }
    return clipIds;
  },
});

export const failAnalysis = internalMutation({
  args: {
    analysisRunId: v.id("analysisRuns"),
    errorMessage: v.string(),
    durationMs: v.number(),
    rawResponse: v.optional(v.string()),
    rawResponseTruncated: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.analysisRunId);
    if (!run || run.status === "complete") return null;
    const now = Date.now();
    const update: {
      status: "failed";
      errorMessage: string;
      durationMs: number;
      updatedAt: number;
      completedAt: number;
      rawResponse?: string;
      rawResponseTruncated?: boolean;
    } = {
      status: "failed",
      errorMessage: args.errorMessage.slice(0, 500),
      durationMs: args.durationMs,
      updatedAt: now,
      completedAt: now,
    };
    if (args.rawResponse !== undefined) update.rawResponse = args.rawResponse;
    if (args.rawResponseTruncated !== undefined) update.rawResponseTruncated = args.rawResponseTruncated;
    await ctx.db.patch(args.analysisRunId, update);
    return null;
  },
});

function emptyAnalysisInput(userId: Id<"users">, videoDurationSec: number | null, errorMessage: string) {
  return { transcriptId: null, userId, segments: [], words: [], videoDurationSec, errorMessage };
}
