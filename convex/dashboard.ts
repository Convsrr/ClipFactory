import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import { presentProjectSummary } from "./lib/presenters";
import { projectSummaryValidator } from "./lib/validators";

export const summary = query({
  args: {},
  returns: v.object({
    user: v.object({
      name: v.string(),
      email: v.string(),
      plan: v.union(v.literal("free"), v.literal("creator"), v.literal("studio")),
      creditsRemaining: v.number(),
      creditsUsedThisPeriod: v.number(),
    }),
    projects: v.array(projectSummaryValidator),
    processing: v.number(),
    clipsReady: v.number(),
  }),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    const [recent, processingProjects, readyClips] = await Promise.all([
      ctx.db.query("projects").withIndex("by_userId_and_createdAt", (q) => q.eq("userId", userId)).order("desc").take(4),
      ctx.db.query("projects").withIndex("by_userId_and_status", (q) => q.eq("userId", userId).eq("status", "processing")).take(100),
      ctx.db.query("clips").withIndex("by_userId", (q) => q.eq("userId", userId)).order("desc").take(100),
    ]);
    const projects = await Promise.all(recent.map((project) => presentProjectSummary(ctx, project)));
    return {
      user: {
        name: user.name,
        email: user.email,
        plan: user.plan,
        creditsRemaining: user.creditsRemaining,
        creditsUsedThisPeriod: user.creditsUsedThisPeriod,
      },
      projects,
      processing: processingProjects.length,
      clipsReady: readyClips.filter((clip) => clip.status === "complete").length,
    };
  },
});
