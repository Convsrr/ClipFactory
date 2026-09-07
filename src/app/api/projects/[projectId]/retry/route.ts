import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchMutation } from "convex/nextjs";
import { api } from "../../../../../../convex/_generated/api";

export async function POST(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) return Response.json({ error: "Project retry is disabled in preview mode." }, { status: 503 });
  const token = await convexAuthNextjsToken();
  if (!token) return Response.json({ error: "Sign in before retrying a project." }, { status: 401 });
  const { projectId } = await params;
  try {
    return Response.json(await fetchMutation(api.projects.retryFailedProject, { projectId }, { token }), { status: 202 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Project retry failed." }, { status: 400 });
  }
}
