import Link from "next/link";
import { ArrowUpRight, FileVideo2, TvMinimalPlay } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Progress } from "@/components/ui/progress";
import { formatDuration, formatRelativeDate, formatStage } from "@/lib/format";
import type { ProjectSummary } from "@/lib/product-types";

export function ProjectRow({ project }: { project: ProjectSummary }) {
  const SourceIcon = project.sourceType === "youtube" ? TvMinimalPlay : FileVideo2;
  return (
    <Link
      href={`/app/projects/${project.id}`}
      className="group relative grid min-h-20 gap-4 border-b border-border px-4 py-4 transition-colors last:border-b-0 hover:bg-muted/55 sm:grid-cols-[minmax(0,1fr)_120px_120px_28px] sm:items-center sm:px-5"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
          <SourceIcon aria-hidden="true" className="size-4.5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight">{project.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDuration(project.durationSec)} · {project.clipCount} {project.clipCount === 1 ? "clip" : "clips"} · {formatRelativeDate(project.createdAt)}
          </p>
          {project.status === "processing" ? (
            <div className="mt-2 flex max-w-xs items-center gap-2 sm:hidden">
              <Progress value={project.progress} className="h-1.5" />
              <span className="text-[11px] text-muted-foreground">{project.activeStage ? formatStage(project.activeStage) : "Processing"}</span>
            </div>
          ) : null}
        </div>
      </div>
      <div className="hidden sm:block">
        <StatusBadge status={project.status} />
      </div>
      <div className="hidden sm:block">
        {project.status === "processing" ? (
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] text-muted-foreground"><span>{project.activeStage ? formatStage(project.activeStage) : "Processing"}</span><span>{project.progress}%</span></div>
            <Progress value={project.progress} className="h-1.5" />
          </div>
        ) : <span className="text-xs text-muted-foreground">Updated {formatRelativeDate(project.updatedAt)}</span>}
      </div>
      <ArrowUpRight aria-hidden="true" className="absolute right-4 top-5 size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 sm:static" />
    </Link>
  );
}
