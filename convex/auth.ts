import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

const STARTER_CREDITS = 60;

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        const email = String(params.email ?? "").trim().toLowerCase();
        const name = String(params.name ?? email.split("@")[0] ?? "Creator").trim();
        if (!email) throw new Error("Email is required");
        const now = Date.now();
        return {
          email,
          name: name || "Creator",
          plan: "free" as const,
          creditsRemaining: STARTER_CREDITS,
          creditsUsedThisPeriod: 0,
          createdAt: now,
          updatedAt: now,
        };
      },
      validatePasswordRequirements(password) {
        if (password.length < 8) throw new Error("Password must contain at least eight characters");
      },
    }),
  ],
  callbacks: {
    async afterUserCreatedOrUpdated(ctx, args) {
      if (args.existingUserId !== null) return;
      await ctx.db.insert("usageLedger", {
        userId: args.userId,
        kind: "allocation",
        creditsDelta: STARTER_CREDITS,
        notes: "Free plan signup allocation",
        createdAt: Date.now(),
      });
    },
  },
});
