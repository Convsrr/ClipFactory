import { getAuthUserId } from "@convex-dev/auth/server";
import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import type { DataModel } from "../_generated/dataModel";
import type { Id } from "../_generated/dataModel";

type DatabaseContext = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>;

export async function requireUserId(ctx: DatabaseContext) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Authentication required");
  return userId;
}

export async function requireOwnedProject(ctx: DatabaseContext, projectId: Id<"projects">) {
  const userId = await requireUserId(ctx);
  const project = await ctx.db.get(projectId);
  if (!project || project.userId !== userId) throw new Error("Project not found");
  return { userId, project };
}
