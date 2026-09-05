import { v } from "convex/values";
import { mutation } from "./_generated/server";

export const syncSubscription = mutation({
  args: {
    forwardingSecret: v.string(), stripeCustomerId: v.string(), stripeSubscriptionId: v.optional(v.string()),
    subscriptionStatus: v.string(), plan: v.union(v.literal("free"), v.literal("creator")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const expected = process.env.STRIPE_WEBHOOK_FORWARDING_SECRET;
    if (!expected || args.forwardingSecret !== expected) throw new Error("Unauthorized webhook forward");
    const users = await ctx.db.query("users").withIndex("by_stripeCustomerId", (q) => q.eq("stripeCustomerId", args.stripeCustomerId)).take(2);
    if (users.length !== 1) throw new Error("Stripe customer is not linked to one user");
    const user = users[0];
    const now = Date.now();
    let creditsRemaining = user.creditsRemaining;
    if (args.plan === "creator" && user.plan === "free") {
      const allocation = Math.max(0, 600 - creditsRemaining);
      creditsRemaining += allocation;
      if (allocation > 0) await ctx.db.insert("usageLedger", { userId: user._id, kind: "allocation", creditsDelta: allocation, notes: "Creator plan activation allocation", createdAt: now });
    }
    await ctx.db.patch(user._id, { plan: args.plan, creditsRemaining, stripeSubscriptionId: args.stripeSubscriptionId, subscriptionStatus: args.subscriptionStatus, updatedAt: now });
    return null;
  },
});
