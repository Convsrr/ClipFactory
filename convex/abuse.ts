import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { rateLimit } from "./lib/rateLimits";

export const consumeMetadataRegeneration = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rateLimit(ctx, { name: "metadataRegeneration", key: args.userId, throws: true });
    return null;
  },
});
