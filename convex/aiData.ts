import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

const candidateValidator = v.object({
  startSec: v.number(), endSec: v.number(), score: v.number(), hook: v.string(), title: v.string(), reason: v.string(), summary: v.string(), category: v.string(), transcriptExcerpt: v.string(),
});

export const transcriptForAnalysis = internalQuery({
  args: { projectId: v.id("projects"), videoId: v.id("videos") },
  returns: v.object({ transcriptId: v.id("transcripts"), userId: v.id("users"), segments: v.array(v.object({ startSec: v.number(), endSec: v.number(), text: v.string() })) }),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");
    const transcripts = await ctx.db.query("transcripts").withIndex("by_videoId", (q) => q.eq("videoId", args.videoId)).order("desc").take(1);
    const transcript = transcripts[0];
    if (!transcript || transcript.status !== "complete") throw new Error("Transcript is not ready for analysis");
    return { transcriptId: transcript._id, userId: project.userId, segments: transcript.segments.map((segment) => ({ startSec: segment.startSec, endSec: segment.endSec, text: segment.text })) };
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

export const storeAnalysis = internalMutation({
  args: {
    projectId: v.id("projects"), videoId: v.id("videos"), transcriptId: v.id("transcripts"),
    model: v.string(), rawResponse: v.string(), candidates: v.array(candidateValidator),
  },
  returns: v.array(v.id("clips")),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");
    const now = Date.now();
    await ctx.db.insert("analysisRuns", { projectId: args.projectId, transcriptId: args.transcriptId, provider: "g0i.ai", model: args.model, promptVersion: "clip-candidates-v1", rawResponse: args.rawResponse, parsedOutput: args.candidates, status: "complete", createdAt: now });
    const clipIds = [];
    for (const candidate of args.candidates) {
      clipIds.push(await ctx.db.insert("clips", { projectId: args.projectId, videoId: args.videoId, userId: project.userId, startSec: candidate.startSec, endSec: candidate.endSec, durationSec: candidate.endSec - candidate.startSec, score: Math.round(candidate.score), title: candidate.title, hook: candidate.hook, description: candidate.summary, summary: candidate.summary, reason: candidate.reason, category: candidate.category, transcriptExcerpt: candidate.transcriptExcerpt, aspectRatio: "9:16", status: "queued", captionPresetKey: "bold-viral", createdAt: now, updatedAt: now }));
    }
    return clipIds;
  },
});
