import type {
  ClipSummary,
  DashboardData,
  ProjectDetail,
  ProjectSummary,
} from "@/lib/product-types";

const now = Date.UTC(2026, 8, 4, 14, 30);

export const previewClips: ClipSummary[] = [
  {
    id: "demo-founder-lesson",
    projectId: "demo-podcast-launch",
    title: "The launch metric most founders miss",
    hook: "Your first 100 users are giving you the wrong signal.",
    description: "A direct lesson on separating early enthusiasm from lasting product demand.",
    transcriptExcerpt:
      "Your first hundred users often know you, so their excitement can hide the hard question: will a stranger come back next week? Retention gives you that answer.",
    startSec: 412,
    endSec: 456,
    durationSec: 44,
    score: 92,
    category: "Startup advice",
    status: "complete",
    previewUrl: null,
    finalUrl: null,
    thumbnailUrl: null,
    captionStyle: "bold-viral",
  },
  {
    id: "demo-content-system",
    projectId: "demo-podcast-launch",
    title: "A content system you can sustain",
    hook: "Stop planning seven new ideas every week.",
    description: "Turn one useful conversation into a week of focused creator content.",
    transcriptExcerpt:
      "Record one useful conversation. Pull out the points with tension, proof, or a clear change in thinking. Those become your clips, posts, and newsletter notes.",
    startSec: 786,
    endSec: 829,
    durationSec: 43,
    score: 86,
    category: "Creator workflow",
    status: "complete",
    previewUrl: null,
    finalUrl: null,
    thumbnailUrl: null,
    captionStyle: "minimal-clean",
  },
];

export const previewProjects: ProjectSummary[] = [
  {
    id: "demo-podcast-launch",
    title: "The honest founder playbook",
    sourceType: "youtube",
    status: "complete",
    createdAt: now - 1000 * 60 * 48,
    updatedAt: now - 1000 * 60 * 16,
    clipCount: 5,
    durationSec: 3180,
    progress: 100,
    activeStage: null,
  },
  {
    id: "demo-customer-stories",
    title: "Customer stories, episode 08",
    sourceType: "upload",
    status: "processing",
    createdAt: now - 1000 * 60 * 12,
    updatedAt: now - 1000 * 60 * 2,
    clipCount: 0,
    durationSec: 2472,
    progress: 58,
    activeStage: "analyse",
  },
  {
    id: "demo-weekly-review",
    title: "Friday product review",
    sourceType: "upload",
    status: "draft",
    createdAt: now - 1000 * 60 * 60 * 26,
    updatedAt: now - 1000 * 60 * 60 * 26,
    clipCount: 0,
    durationSec: null,
    progress: 0,
    activeStage: null,
  },
];

export const previewProject: ProjectDetail = {
  ...previewProjects[0],
  sourceFilename: null,
  sourceUrl: "https://www.youtube.com/watch?v=preview",
  transcriptStatus: "complete",
  transcriptLanguage: "en",
  transcriptText:
    "Your first hundred users often know you, so their excitement can hide the hard question: will a stranger come back next week? Retention gives you that answer. Record one useful conversation and pull out the points with tension, proof, or a clear change in thinking.",
  clips: previewClips,
  timeline: [
    { stage: "ingest", status: "complete", progress: 100 },
    { stage: "transcribe", status: "complete", progress: 100 },
    { stage: "analyse", status: "complete", progress: 100 },
    { stage: "scene_detect", status: "complete", progress: 100 },
    { stage: "face_track", status: "complete", progress: 100 },
    { stage: "caption_render", status: "complete", progress: 100 },
    { stage: "clip_render", status: "complete", progress: 100 },
    { stage: "thumbnail_render", status: "complete", progress: 100 },
  ],
};

export const previewDashboard: DashboardData = {
  mode: "preview",
  user: {
    name: "Alex Morgan",
    email: "alex@example.com",
    plan: "free",
    creditsRemaining: 42,
    creditsUsedThisPeriod: 18,
  },
  projects: previewProjects,
  processing: 1,
  clipsReady: 5,
};

export function getPreviewProject(projectId: string): ProjectDetail | null {
  if (projectId === previewProject.id) return previewProject;

  const project = previewProjects.find((item) => item.id === projectId);
  if (!project) return null;

  const completedStages = Math.round((project.progress / 100) * 8);
  const statuses: ProjectDetail["timeline"] = [
    "ingest",
    "transcribe",
    "analyse",
    "scene_detect",
    "face_track",
    "caption_render",
    "clip_render",
    "thumbnail_render",
  ].map((stage, index) => ({
    stage: stage as ProjectDetail["timeline"][number]["stage"],
    status:
      index < completedStages
        ? "complete"
        : index === completedStages && project.status === "processing"
          ? "running"
          : "queued",
    progress:
      index < completedStages
        ? 100
        : index === completedStages && project.status === "processing"
          ? Math.max(12, project.progress % 13)
          : 0,
  }));

  return {
    ...project,
    sourceFilename: project.sourceType === "upload" ? "interview-08.mp4" : null,
    sourceUrl: null,
    transcriptStatus: project.status === "processing" ? "complete" : "queued",
    transcriptLanguage: project.status === "processing" ? "en" : null,
    transcriptText: null,
    clips: [],
    timeline: statuses,
  };
}

export function getPreviewClip(clipId: string): ClipSummary | null {
  return previewClips.find((clip) => clip.id === clipId) ?? null;
}
