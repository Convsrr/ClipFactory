import { v } from "convex/values";
import { jobStatus, processingStage, projectStatus } from "../schema";

export const clipSummaryValidator = v.object({
  id: v.string(),
  projectId: v.string(),
  title: v.string(),
  hook: v.string(),
  description: v.string(),
  transcriptExcerpt: v.string(),
  startSec: v.number(),
  endSec: v.number(),
  durationSec: v.number(),
  score: v.number(),
  category: v.string(),
  status: jobStatus,
  previewUrl: v.union(v.string(), v.null()),
  finalUrl: v.union(v.string(), v.null()),
  thumbnailUrl: v.union(v.string(), v.null()),
  captionStyle: v.union(v.literal("bold-viral"), v.literal("minimal-clean"), v.literal("podcast")),
});

export const projectSummaryValidator = v.object({
  id: v.string(),
  title: v.string(),
  sourceType: v.union(v.literal("upload"), v.literal("youtube")),
  status: projectStatus,
  createdAt: v.number(),
  updatedAt: v.number(),
  clipCount: v.number(),
  durationSec: v.union(v.number(), v.null()),
  progress: v.number(),
  activeStage: v.union(processingStage, v.null()),
});

export const timelineItemValidator = v.object({
  stage: processingStage,
  status: jobStatus,
  progress: v.number(),
});
