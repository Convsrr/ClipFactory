import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { stageNameValidator } from "./lib/stages";

export const payload = internalQuery({
  args: { jobId: v.id("renderJobs"), projectId: v.id("projects"), videoId: v.id("videos"), stage: stageNameValidator },
  returns: v.object({
    jobId: v.string(), projectId: v.string(), videoId: v.string(), stage: stageNameValidator,
    sourceType: v.union(v.literal("upload"), v.literal("youtube")),
    originalUrl: v.union(v.string(), v.null()), originalObjectKey: v.union(v.string(), v.null()),
    proxyObjectKey: v.union(v.string(), v.null()), audioObjectKey: v.union(v.string(), v.null()), outputPrefix: v.string(),
    clips: v.array(v.object({ id: v.string(), startSec: v.number(), endSec: v.number(), captionPresetKey: v.string(), transcriptExcerpt: v.string() })),
  }),
  handler: async (ctx, args) => {
    const [job, project, video, clips] = await Promise.all([
      ctx.db.get(args.jobId),
      ctx.db.get(args.projectId),
      ctx.db.get(args.videoId),
      ctx.db.query("clips").withIndex("by_projectId", (q) => q.eq("projectId", args.projectId)).take(20),
    ]);
    if (!job || !project || !video || job.projectId !== project._id || video.projectId !== project._id || job.type !== args.stage) throw new Error("Worker job payload is inconsistent");
    return {
      jobId: job._id as string, projectId: project._id as string, videoId: video._id as string, stage: args.stage,
      sourceType: project.sourceType, originalUrl: video.originalUrl ?? null, originalObjectKey: video.originalObjectKey ?? null,
      proxyObjectKey: video.proxyObjectKey ?? null, audioObjectKey: video.audioObjectKey ?? null,
      outputPrefix: `${project.userId}/projects/${project._id}`,
      clips: clips.map((clip) => ({ id: clip._id as string, startSec: clip.startSec, endSec: clip.endSec, captionPresetKey: clip.captionPresetKey, transcriptExcerpt: clip.transcriptExcerpt })),
    };
  },
});
