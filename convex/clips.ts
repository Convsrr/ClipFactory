import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import { presentClip } from "./lib/presenters";
import { clipSummaryValidator } from "./lib/validators";

export const detail = query({
  args: { clipId: v.string() },
  returns: v.union(clipSummaryValidator, v.null()),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const clipId = ctx.db.normalizeId("clips", args.clipId);
    if (!clipId) return null;
    const clip = await ctx.db.get(clipId);
    if (!clip || clip.userId !== userId) return null;
    return presentClip(clip);
  },
});

export const updateGeneratedMetadata = internalMutation({
  args: {
    clipId: v.string(),
    field: v.union(v.literal("hook"), v.literal("title"), v.literal("description")),
    value: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const clipId = ctx.db.normalizeId("clips", args.clipId);
    if (!clipId) throw new Error("Clip not found");
    await ctx.db.patch(clipId, { [args.field]: args.value, updatedAt: Date.now() });
    return null;
  },
});
