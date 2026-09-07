import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import { rateLimitTables } from "convex-helpers/server/rateLimit";
import { renderJobMetadataValidator } from "./lib/stages";

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
  durationSec: v.optional(v.number()),
  score: v.number(),
  modelScore: v.optional(v.number()),
  confidence: v.optional(v.number()),
  hook: v.string(),
  title: v.string(),
  description: v.optional(v.string()),
  reason: v.string(),
  summary: v.string(),
  category: v.string(),
  transcriptExcerpt: v.string(),
  dimensions: v.optional(v.object({
    hookStrength: v.number(),
    emotionalImpact: v.number(),
    curiosity: v.number(),
    value: v.number(),
    storytelling: v.number(),
    novelty: v.number(),
    standaloneContext: v.number(),
    payoff: v.number(),
    shareability: v.number(),
  })),
  scoreBreakdown: v.optional(v.object({
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
  })),
});

export default defineSchema({
  ...authTables,
  ...rateLimitTables,
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

  uploadIntents: defineTable({
    userId: v.id("users"),
    objectKey: v.string(),
    sourceFilename: v.string(),
    mimeType: v.string(),
    fileSizeBytes: v.number(),
    status: v.union(v.literal("pending"), v.literal("attached"), v.literal("expired")),
    projectId: v.optional(v.id("projects")),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_objectKey", ["objectKey"])
    .index("by_userId_and_status", ["userId", "status"])
    .index("by_status_and_expiresAt", ["status", "expiresAt"]),

  transcripts: defineTable({
    projectId: v.id("projects"),
    videoId: v.id("videos"),
    language: v.optional(v.string()),
    fullText: v.optional(v.string()),
    segments: v.array(transcriptSegment),
    words: v.optional(v.array(transcriptWord)),
    engine: v.string(),
    status: jobStatus,
    renderJobId: v.optional(v.id("renderJobs")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_videoId", ["videoId"])
    .index("by_status", ["status"])
    .index("by_renderJobId", ["renderJobId"]),

  analysisRuns: defineTable({
    projectId: v.id("projects"),
    transcriptId: v.optional(v.id("transcripts")),
    provider: v.string(),
    model: v.string(),
    promptVersion: v.string(),
    inputMetadata: v.optional(v.object({
      videoId: v.id("videos"),
      segmentCount: v.number(),
      wordCount: v.number(),
      inputCharacterCount: v.number(),
      chunkCount: v.number(),
      maxCandidates: v.number(),
      videoDurationSec: v.union(v.number(), v.null()),
    })),
    rawResponse: v.optional(v.string()),
    rawResponseTruncated: v.optional(v.boolean()),
    parsedOutput: v.array(analysedCandidate),
    status: jobStatus,
    errorMessage: v.optional(v.string()),
    candidateCount: v.optional(v.number()),
    acceptedCount: v.optional(v.number()),
    rejectionCount: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
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
    confidence: v.optional(v.number()),
    scoreBreakdown: v.optional(v.object({
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
    })),
    analysisRunId: v.optional(v.id("analysisRuns")),
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
    .index("by_analysisRunId", ["analysisRunId"])
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
    videoId: v.optional(v.id("videos")),
    clipId: v.optional(v.id("clips")),
    type: processingStage,
    status: jobStatus,
    progress: v.number(),
    errorMessage: v.optional(v.string()),
    workerRef: v.optional(v.string()),
    workflowId: v.optional(v.string()),
    eventName: v.optional(v.string()),
    attempt: v.number(),
    workerId: v.optional(v.string()),
    claimedAt: v.optional(v.number()),
    processingStartedAt: v.optional(v.number()),
    leaseExpiresAt: v.optional(v.number()),
    lastHeartbeatAt: v.optional(v.number()),
    nextAttemptAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    completedAttempt: v.optional(v.number()),
    errorCode: v.optional(v.string()),
    retryable: v.optional(v.boolean()),
    lastCallbackAt: v.optional(v.number()),
    eventSentAt: v.optional(v.number()),
    appliedAt: v.optional(v.number()),
    metadata: v.optional(renderJobMetadataValidator),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_projectId_and_status", ["projectId", "status"])
    .index("by_clipId", ["clipId"])
    .index("by_status", ["status"])
    .index("by_status_and_nextAttemptAt", ["status", "nextAttemptAt"])
    .index("by_status_and_leaseExpiresAt", ["status", "leaseExpiresAt"])
    .index("by_workflowId_and_type", ["workflowId", "type"])
    .index("by_createdAt", ["createdAt"]),

  usageLedger: defineTable({
    userId: v.id("users"),
    projectId: v.optional(v.id("projects")),
    clipId: v.optional(v.id("clips")),
    renderJobId: v.optional(v.id("renderJobs")),
    idempotencyKey: v.optional(v.string()),
    reason: v.optional(v.string()),
    kind: v.union(v.literal("allocation"), v.literal("processing_debit"), v.literal("refund"), v.literal("adjustment")),
    creditsDelta: v.number(),
    costEstimateUsd: v.optional(v.number()),
    notes: v.string(),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_createdAt", ["userId", "createdAt"])
    .index("by_projectId", ["projectId"])
    .index("by_idempotencyKey", ["idempotencyKey"])
    .index("by_clipId", ["clipId"]),

  billingEvents: defineTable({
    eventId: v.string(),
    eventType: v.string(),
    stripeCustomerId: v.string(),
    processedAt: v.number(),
  }).index("by_eventId", ["eventId"]),
});
