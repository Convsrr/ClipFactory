import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { constantTimeEqual } from "./lib/secrets";

export const syncSubscription = mutation({
  args: {
    forwardingSecret: v.string(), eventId: v.string(), eventType: v.string(), stripeCustomerId: v.string(), stripeSubscriptionId: v.optional(v.string()),
    subscriptionStatus: v.string(), plan: v.union(v.literal("free"), v.literal("creator")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const expected = process.env.STRIPE_WEBHOOK_FORWARDING_SECRET;
    if (!expected || !constantTimeEqual(args.forwardingSecret, expected)) throw new Error("Unauthorized webhook forward");
    const priorEvent = await ctx.db.query("billingEvents").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).first();
    if (priorEvent) return null;
    const users = await ctx.db.query("users").withIndex("by_stripeCustomerId", (q) => q.eq("stripeCustomerId", args.stripeCustomerId)).take(2);
    if (users.length !== 1) throw new Error("Stripe customer is not linked to one user");
    const user = users[0];
    const now = Date.now();
    let creditsRemaining = user.creditsRemaining;
    if (args.plan === "creator" && user.plan === "free") {
      const allocation = Math.max(0, 600 - creditsRemaining);
      creditsRemaining += allocation;
      if (allocation > 0) await ctx.db.insert("usageLedger", {
        userId: user._id,
        idempotencyKey: `stripe:${args.eventId}:allocation`,
        reason: "creator_plan_activation",
        kind: "allocation",
        creditsDelta: allocation,
        notes: "Creator plan activation allocation",
        createdAt: now,
      });
    }
    await ctx.db.patch(user._id, { plan: args.plan, creditsRemaining, stripeSubscriptionId: args.stripeSubscriptionId, subscriptionStatus: args.subscriptionStatus, updatedAt: now });
    await ctx.db.insert("billingEvents", { eventId: args.eventId, eventType: args.eventType, stripeCustomerId: args.stripeCustomerId, processedAt: now });
    return null;
  },
});
