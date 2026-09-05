import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/auth";

const currentUserValidator = v.object({
  id: v.string(),
  name: v.string(),
  email: v.string(),
  avatarUrl: v.union(v.string(), v.null()),
  plan: v.union(v.literal("free"), v.literal("creator"), v.literal("studio")),
  creditsRemaining: v.number(),
  creditsUsedThisPeriod: v.number(),
  stripeCustomerId: v.union(v.string(), v.null()),
  stripeSubscriptionId: v.union(v.string(), v.null()),
});

export const current = query({
  args: {},
  returns: currentUserValidator,
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    return {
      id: user._id as string,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl ?? user.image ?? null,
      plan: user.plan,
      creditsRemaining: user.creditsRemaining,
      creditsUsedThisPeriod: user.creditsUsedThisPeriod,
      stripeCustomerId: user.stripeCustomerId ?? null,
      stripeSubscriptionId: user.stripeSubscriptionId ?? null,
    };
  },
});

export const updateProfile = mutation({
  args: { name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const name = args.name.trim();
    if (!name || name.length > 80) throw new Error("Name must contain 1 to 80 characters");
    await ctx.db.patch(userId, { name, updatedAt: Date.now() });
    return null;
  },
});

export const setStripeCustomer = mutation({
  args: { stripeCustomerId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    if (user.stripeCustomerId && user.stripeCustomerId !== args.stripeCustomerId) {
      throw new Error("Stripe customer is already linked");
    }
    await ctx.db.patch(userId, { stripeCustomerId: args.stripeCustomerId, updatedAt: Date.now() });
    return null;
  },
});
