import "server-only";

import { cache } from "react";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { redirect } from "next/navigation";
import { api } from "../../convex/_generated/api";
import { getPreviewClip, getPreviewProject, previewDashboard, previewProjects } from "@/lib/demo-data";
import type { ClipSummary, DashboardData, ProjectDetail, ProjectSummary } from "@/lib/product-types";

export function isBackendConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);
}

async function authToken() {
  const token = await convexAuthNextjsToken();
  if (!token) redirect("/sign-in");
  return token;
}

export const loadDashboard = cache(async (): Promise<DashboardData> => {
  if (!isBackendConfigured()) return previewDashboard;
  const token = await authToken();
  const data = await fetchQuery(api.dashboard.summary, {}, { token });
  return { ...data, mode: "live" } as DashboardData;
});

export const loadProjects = cache(async (): Promise<ProjectSummary[]> => {
  if (!isBackendConfigured()) return previewProjects;
  const token = await authToken();
  return (await fetchQuery(api.projects.list, { limit: 50 }, { token })) as ProjectSummary[];
});

export const loadProject = cache(async (projectId: string): Promise<ProjectDetail | null> => {
  if (!isBackendConfigured()) return getPreviewProject(projectId);
  const token = await authToken();
  return (await fetchQuery(api.projects.detail, { projectId }, { token })) as ProjectDetail | null;
});

export const loadClip = cache(async (clipId: string): Promise<ClipSummary | null> => {
  if (!isBackendConfigured()) return getPreviewClip(clipId);
  const token = await authToken();
  return (await fetchQuery(api.clips.detail, { clipId }, { token })) as ClipSummary | null;
});
