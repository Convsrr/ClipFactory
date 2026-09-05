import { randomUUID } from "node:crypto";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { z } from "zod";
import { api } from "../../../../../convex/_generated/api";
import { createSourceUpload } from "@/server/r2";

const requestSchema = z.object({
  filename: z.string().min(1).max(240),
  mimeType: z.enum(["video/mp4", "video/quicktime", "video/webm"]),
  fileSizeBytes: z.number().int().positive().max(5 * 1024 * 1024 * 1024),
});

export async function POST(request: Request) {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) return Response.json({ error: "Uploads are disabled in preview mode." }, { status: 503 });
  const token = await convexAuthNextjsToken();
  if (!token) return Response.json({ error: "Sign in before uploading." }, { status: 401 });
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Choose an MP4, MOV, or WebM file smaller than 5 GB." }, { status: 400 });
  const user = await fetchQuery(api.users.current, {}, { token });
  const safeFilename = parsed.data.filename.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 160) || "source-video";
  const objectKey = `${user.id}/sources/${randomUUID()}-${safeFilename}`;
  try {
    const uploadUrl = await createSourceUpload(objectKey, parsed.data.mimeType, parsed.data.fileSizeBytes);
    return Response.json({ uploadUrl, objectKey });
  } catch (error) {
    const message = error instanceof Error && error.message.endsWith("is not configured") ? error.message : "Could not create an upload target.";
    return Response.json({ error: message }, { status: 503 });
  }
}
