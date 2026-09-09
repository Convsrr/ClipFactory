export const processingStages = [
  "ingest",
  "transcribe",
  "analyse",
  "scene_detect",
  "face_track",
  "caption_render",
  "clip_render",
  "thumbnail_render",
] as const;

export type ProcessingStage = (typeof processingStages)[number];
export type ProjectStatus = "draft" | "processing" | "complete" | "failed";
export type JobStatus = "queued" | "running" | "complete" | "failed";

export type ClipSummary = {
  id: string;
  projectId: string;
  title: string;
  hook: string;
  description: string;
  transcriptExcerpt: string;
  startSec: number;
  endSec: number;
  durationSec: number;
  score: number;
  category: string;
  status: JobStatus;
  previewUrl: string | null;
  finalUrl: string | null;
  thumbnailUrl: string | null;
  captionStyle: "bold-viral" | "minimal-clean" | "podcast";
};

export type ProjectSummary = {
  id: string;
  title: string;
  sourceType: "upload" | "youtube" | "google_drive";
  status: ProjectStatus;
  createdAt: number;
  updatedAt: number;
  clipCount: number;
  durationSec: number | null;
  progress: number;
  activeStage: ProcessingStage | null;
};

export type ProjectDetail = ProjectSummary & {
  sourceFilename: string | null;
  sourceUrl: string | null;
  transcriptStatus: "queued" | "running" | "complete" | "failed";
  transcriptLanguage: string | null;
  transcriptText: string | null;
  clips: ClipSummary[];
  timeline: Array<{
    stage: ProcessingStage;
    status: JobStatus;
    progress: number;
  }>;
};

export type DashboardData = {
  mode: "live" | "preview";
  user: {
    name: string;
    email: string;
    plan: "free" | "creator" | "studio";
    creditsRemaining: number;
    creditsUsedThisPeriod: number;
  };
  projects: ProjectSummary[];
  processing: number;
  clipsReady: number;
};
