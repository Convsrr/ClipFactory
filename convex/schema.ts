import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export const projectStatus = v.union(v.literal("draft"), v.literal("processing"), v.literal("complete"), v.literal("failed"));
export const jobStatus = v.union(v.literal("queued"), v.literal("running"), v.literal("complete"), v.literal("failed"));
export const processingStage = v.union(
  v.literal("ingest"),
  v.literal("transcribe"),
  v.literal("analyse"),
  v.literal("scene_detect"),
  v.literal("face_track"),
  v.literal("caption_render"),
  v.literal("clip_render"),
  v.literal("thumbnail_render"),
);

const transcriptSegment = v.object({
  startSec: v.number(),
  endSec: v.number(),
  text: v.string(),
  speaker: v.optional(v.string()),
});

const transcriptWord = v.object({
  startSec: v.number(),
  endSec: v.number(),
  text: v.string(),
  confidence: v.optional(v.number()),
});

const analysedCandidate = v.object({
  startSec: v.number(),
  endSec: v.number(),
  score: v.number(),
  hook: v.string(),
  title: v.string(),
  reason: v.string(),
  summary: v.string(),
  category: v.string(),
  transcriptExcerpt: v.string(),
});

export default defineSchema({
  ...authTables,
  users: defineTable({
    name: v.string(),
    image: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    email: v.string(),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    plan: v.union(v.literal("free"), v.literal("creator"), v.literal("studio")),
    creditsRemaining: v.number(),
    creditsUsedThisPeriod: v.number(),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    subscriptionStatus: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_stripeCustomerId", ["stripeCustomerId"])
    .index("by_plan", ["plan"]),

  projects: defineTable({
    userId: v.id("users"),
    title: v.string(),
    sourceType: v.union(v.literal("upload"), v.literal("youtube")),
    status: projectStatus,
    activeStage: v.optional(processingStage),
    progress: v.number(),
    errorMessage: v.optional(v.string()),
    workflowId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_createdAt", ["userId", "createdAt"])
    .index("by_userId_and_status", ["userId", "status"])
    .index("by_status", ["status"]),

  videos: defineTable({
    projectId: v.id("projects"),
    userId: v.id("users"),
    originalUrl: v.optional(v.string()),
    proxyUrl: v.optional(v.string()),
    audioUrl: v.optional(v.string()),
    originalObjectKey: v.optional(v.string()),
    proxyObjectKey: v.optional(v.string()),
    audioObjectKey: v.optional(v.string()),
    sourceFilename: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    durationSec: v.optional(v.number()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    fps: v.optional(v.number()),
    fileSizeBytes: v.optional(v.number()),
    uploadStatus: v.union(v.literal("pending"), v.literal("uploaded"), v.literal("processing"), v.literal("complete"), v.literal("failed")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_userId", ["userId"])
    .index("by_uploadStatus", ["uploadStatus"]),

  transcripts: defineTable({
    projectId: v.id("projects"),
    videoId: v.id("videos"),
    language: v.optional(v.string()),
    fullText: v.optional(v.string()),
    segments: v.array(transcriptSegment),
    words: v.optional(v.array(transcriptWord)),
    engine: v.string(),
    status: jobStatus,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_videoId", ["videoId"])
    .index("by_status", ["status"]),

  analysisRuns: defineTable({
    projectId: v.id("projects"),
    transcriptId: v.id("transcripts"),
    provider: v.string(),
    model: v.string(),
    promptVersion: v.string(),
    rawResponse: v.string(),
    parsedOutput: v.array(analysedCandidate),
    status: jobStatus,
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_transcriptId", ["transcriptId"])
    .index("by_status", ["status"]),

  clips: defineTable({
    projectId: v.id("projects"),
    videoId: v.id("videos"),
    userId: v.id("users"),
    startSec: v.number(),
    endSec: v.number(),
    durationSec: v.number(),
    score: v.number(),
    title: v.string(),
    hook: v.string(),
    description: v.string(),
    summary: v.string(),
    reason: v.string(),
    category: v.string(),
    transcriptExcerpt: v.string(),
    aspectRatio: v.string(),
    status: jobStatus,
    previewUrl: v.optional(v.string()),
    finalUrl: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    previewObjectKey: v.optional(v.string()),
    finalObjectKey: v.optional(v.string()),
    thumbnailObjectKey: v.optional(v.string()),
    captionStyleId: v.optional(v.id("captionStyles")),
    captionPresetKey: v.union(v.literal("bold-viral"), v.literal("minimal-clean"), v.literal("podcast")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_videoId", ["videoId"])
    .index("by_userId", ["userId"])
    .index("by_projectId_and_status", ["projectId", "status"])
    .index("by_status", ["status"]),

  captionStyles: defineTable({
    userId: v.optional(v.id("users")),
    name: v.string(),
    presetKey: v.string(),
    fontFamily: v.string(),
    fontSize: v.number(),
    fontWeight: v.number(),
    textTransform: v.union(v.literal("none"), v.literal("uppercase")),
    position: v.union(v.literal("top"), v.literal("middle"), v.literal("bottom")),
    wordHighlight: v.boolean(),
    strokeWidth: v.number(),
    shadow: v.boolean(),
    safeMargin: v.number(),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_presetKey", ["presetKey"]),

  renderJobs: defineTable({
    projectId: v.id("projects"),
    clipId: v.optional(v.id("clips")),
    type: processingStage,
    status: jobStatus,
    progress: v.number(),
    errorMessage: v.optional(v.string()),
    workerRef: v.optional(v.string()),
    workflowId: v.optional(v.string()),
    attempt: v.number(),
    appliedAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_projectId_and_status", ["projectId", "status"])
    .index("by_clipId", ["clipId"])
    .index("by_status", ["status"])
    .index("by_createdAt", ["createdAt"]),

  usageLedger: defineTable({
    userId: v.id("users"),
    projectId: v.optional(v.id("projects")),
    clipId: v.optional(v.id("clips")),
    kind: v.union(v.literal("allocation"), v.literal("processing_debit"), v.literal("refund"), v.literal("adjustment")),
    creditsDelta: v.number(),
    costEstimateUsd: v.optional(v.number()),
    notes: v.string(),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_createdAt", ["userId", "createdAt"])
    .index("by_projectId", ["projectId"])
    .index("by_clipId", ["clipId"]),
});
