import type { GenericQueryCtx } from "convex/server";
import type { DataModel, Doc } from "../_generated/dataModel";

export function presentClip(clip: Doc<"clips">) {
  return {
    id: clip._id as string,
    projectId: clip.projectId as string,
    title: clip.title,
    hook: clip.hook,
    description: clip.description,
    transcriptExcerpt: clip.transcriptExcerpt,
    startSec: clip.startSec,
    endSec: clip.endSec,
    durationSec: clip.durationSec,
    score: clip.score,
    category: clip.category,
    status: clip.status,
    previewUrl: clip.previewUrl ?? null,
    finalUrl: clip.finalUrl ?? null,
    thumbnailUrl: clip.thumbnailUrl ?? null,
    captionStyle: clip.captionPresetKey,
  };
}

export async function presentProjectSummary(ctx: GenericQueryCtx<DataModel>, project: Doc<"projects">) {
  const [videos, clips] = await Promise.all([
    ctx.db.query("videos").withIndex("by_projectId", (q) => q.eq("projectId", project._id)).take(1),
    ctx.db.query("clips").withIndex("by_projectId", (q) => q.eq("projectId", project._id)).take(50),
  ]);
  return {
    id: project._id as string,
    title: project.title,
    sourceType: project.sourceType,
    status: project.status,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    clipCount: clips.length,
    durationSec: videos[0]?.durationSec ?? null,
    progress: project.progress,
    activeStage: project.status === "processing" ? project.activeStage ?? null : null,
  };
}
