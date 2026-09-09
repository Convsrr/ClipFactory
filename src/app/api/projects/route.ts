import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchMutation } from "convex/nextjs";
import { z } from "zod";
import { api } from "../../../../convex/_generated/api";
import { PRODUCT_LIMITS } from "../../../../shared/reliability";
import { readBoundedJson, RequestBodyError } from "@/server/request";

const uploadSchema = z.object({
  sourceType: z.literal("upload"), title: z.string().min(1).max(140), objectKey: z.string().min(1).max(500),
  sourceFilename: z.string().min(1).max(240), mimeType: z.enum(["video/mp4", "video/quicktime", "video/webm"]),
  fileSizeBytes: z.number().int().positive().max(PRODUCT_LIMITS.maxSourceFileBytes),
});
const youtubeSchema = z.object({ sourceType: z.literal("youtube"), title: z.string().min(1).max(140), youtubeUrl: z.string().url().max(500) });
const googleDriveSchema = z.object({
  sourceType: z.literal("google_drive"),
  title: z.string().min(1).max(140),
  googleDriveUrl: z.string().url().max(500).refine(isGoogleDriveUrl, "Enter a valid Google Drive file URL."),
});
const requestSchema = z.discriminatedUnion("sourceType", [uploadSchema, youtubeSchema, googleDriveSchema]);

export async function POST(request: Request) {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) return Response.json({ error: "Projects are disabled in preview mode." }, { status: 503 });
  const token = await convexAuthNextjsToken();
  if (!token) return Response.json({ error: "Sign in before creating a project." }, { status: 401 });
  let body: unknown;
  try {
    body = await readBoundedJson(request, 16 * 1024);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid request body." }, { status: error instanceof RequestBodyError ? error.status : 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Check the project title and source details." }, { status: 400 });
  try {
    const result = parsed.data.sourceType === "upload"
      ? await fetchMutation(api.projects.createFromUpload, parsed.data, { token })
      : parsed.data.sourceType === "youtube"
        ? await fetchMutation(api.projects.createFromYoutube, { title: parsed.data.title, youtubeUrl: parsed.data.youtubeUrl }, { token })
        : await fetchMutation(api.projects.createFromGoogleDrive, { title: parsed.data.title, googleDriveUrl: parsed.data.googleDriveUrl }, { token });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not create the project." }, { status: 400 });
  }
}

function isGoogleDriveUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const hostname = url.hostname.toLowerCase();
    if (hostname !== "drive.google.com" && hostname !== "www.drive.google.com" && hostname !== "drive.usercontent.google.com") return false;
    const pathMatch = url.pathname.match(/\/file\/d\/([^/]+)/i);
    const fileId = pathMatch?.[1] ?? url.searchParams.get("id");
    return Boolean(fileId && /^[a-zA-Z0-9_-]{3,200}$/.test(fileId));
  } catch {
    return false;
  }
}
