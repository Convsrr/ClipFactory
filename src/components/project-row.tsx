import Link from "next/link";
import { ArrowUpRight, FileVideo2, HardDrive, TvMinimalPlay } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Progress } from "@/components/ui/progress";
import { formatDuration, formatRelativeDate, formatStage } from "@/lib/format";
import type { ProjectSummary } from "@/lib/product-types";

export function ProjectRow({ project }: { project: ProjectSummary }) {
  const SourceIcon = project.sourceType === "youtube" ? TvMinimalPlay : project.sourceType === "google_drive" ? HardDrive : FileVideo2;
  const projectMeta = `${formatDuration(project.durationSec)} · ${project.clipCount} ${project.clipCount === 1 ? "clip" : "clips"} · ${formatRelativeDate(project.createdAt)}`;

  return (
    <Link
      href={`/app/projects/${project.id}`}
      aria-label={`Open project ${project.title}`}
      className="group relative grid min-h-24 gap-4 border-b border-border/75 px-4 py-4 transition-colors duration-200 last:border-b-0 hover:bg-surface/80 sm:grid-cols-[minmax(0,1fr)_130px_150px_28px] sm:items-center sm:px-5"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground transition-colors duration-200 group-hover:bg-accent group-hover:text-accent-foreground">
          <SourceIcon aria-hidden="true" className="size-4.5" />
        </span>
        <div className="min-w-0 pt-0.5">
          <p className="truncate text-sm font-semibold tracking-tight">{project.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{projectMeta}</p>
          {project.status === "processing" ? (
            <div className="mt-3 flex max-w-xs items-center gap-2 sm:hidden">
              <Progress value={project.progress} className="h-1.5" aria-label={`${project.progress}% processed`} />
              <span className="shrink-0 text-[11px] text-muted-foreground">{project.activeStage ? formatStage(project.activeStage) : "Processing"}</span>
            </div>
          ) : null}
        </div>
      </div>
      <div className="hidden sm:block"><StatusBadge status={project.status} /></div>
      <div className="hidden sm:block">
        {project.status === "processing" ? (
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] text-muted-foreground"><span>{project.activeStage ? formatStage(project.activeStage) : "Processing"}</span><span className="font-mono tabular-nums">{project.progress}%</span></div>
            <Progress value={project.progress} className="h-1.5" aria-label={`${project.progress}% processed`} />
          </div>
        ) : <span className="text-xs text-muted-foreground">Updated {formatRelativeDate(project.updatedAt)}</span>}
      </div>
      <ArrowUpRight aria-hidden="true" className="absolute right-4 top-5 size-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 sm:static" />
    </Link>
  );
}
