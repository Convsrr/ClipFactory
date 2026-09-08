import Link from "next/link";
import { ArrowLeft, Captions, Check, Circle, Download, FileVideo2, LoaderCircle, TvMinimalPlay } from "lucide-react";
import { ClipCard } from "@/components/clip-card";
import { RetryProjectButton } from "@/components/retry-project-button";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatDuration, formatStage } from "@/lib/format";
import type { ProjectDetail } from "@/lib/product-types";

export function ProjectDetailView({ project, previewMode }: { project: ProjectDetail; previewMode: boolean }) {
  const SourceIcon = project.sourceType === "youtube" ? TvMinimalPlay : FileVideo2;
  const completedStages = project.timeline.filter((item) => item.status === "complete").length;
  const hasDownloads = project.clips.some((clip) => clip.finalUrl);
  const emptyMessage = project.status === "failed"
    ? "Retry the failed stage to continue processing this source."
    : project.status === "draft"
      ? "Add a source video to start finding candidate clips."
      : "Candidates appear here after transcript analysis completes.";

  return (
    <div className="space-y-8">
      <Button asChild variant="ghost" className="-ml-3 min-h-11 px-3 text-muted-foreground"><Link href="/app/projects"><ArrowLeft aria-hidden="true" /> Projects</Link></Button>

      <section className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><StatusBadge status={project.status} />{previewMode ? <Badge variant="outline">Sample project</Badge> : null}</div>
          <h1 className="mt-4 max-w-4xl text-balance text-3xl font-semibold tracking-[-0.055em] sm:text-4xl">{project.title}</h1>
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground"><SourceIcon aria-hidden="true" className="size-4" /><span className="capitalize">{project.sourceType}</span><span aria-hidden="true">·</span><span>{formatDuration(project.durationSec)}</span><span aria-hidden="true">·</span><span>{project.clips.length} candidates</span></p>
        </div>
        <div className="flex flex-wrap gap-2">
          <RetryProjectButton projectId={project.id} disabled={previewMode || project.status !== "failed"} />
          <Button className="min-h-11" disabled={!hasDownloads} title={hasDownloads ? "Download every finished clip" : "Available when a clip has finished rendering"}><Download aria-hidden="true" /> Download all</Button>
        </div>
      </section>

      {project.status === "processing" ? (
        <Card className="border-info/35 bg-info/10 shadow-none" role="status" aria-live="polite">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold">Processing in the background</p><p className="mt-1 text-xs leading-5 text-muted-foreground">You can leave this page. We will update the project after each worker stage.</p></div><span className="font-mono text-sm font-semibold tabular-nums">{project.progress}%</span></div>
            <Progress value={project.progress} className="mt-4 h-2" aria-label={`${project.progress}% processed`} />
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="border-border/80 bg-card/70 shadow-none">
          <CardHeader className="flex-row items-start justify-between space-y-0 p-5 pb-3"><div><CardTitle className="text-base">Processing timeline</CardTitle><p className="mt-1 text-xs text-muted-foreground">{completedStages} of {project.timeline.length} stages complete</p></div><Badge variant="secondary" className="font-mono tabular-nums">{project.progress}%</Badge></CardHeader>
          <CardContent className="p-5 pt-4">
            <ol className="space-y-0">
              {project.timeline.map((item, index) => {
                const Icon = item.status === "complete" ? Check : item.status === "running" ? LoaderCircle : Circle;
                const statusClass = item.status === "complete" ? "border-success text-success" : item.status === "running" ? "border-info text-info" : "border-border text-muted-foreground";
                return (
                  <li key={item.stage} className="relative flex min-h-14 gap-3 pb-4 last:pb-0" aria-label={`${formatStage(item.stage)}: ${item.status}`}>
                    {index < project.timeline.length - 1 ? <span className="absolute left-[11px] top-6 h-[calc(100%-0.25rem)] w-px bg-border" aria-hidden="true" /> : null}
                    <span className={`relative z-10 grid size-6 shrink-0 place-items-center rounded-full border bg-card ${statusClass}`}><Icon aria-hidden="true" className={`size-3.5 ${item.status === "running" ? "animate-spin" : ""}`} /></span>
                    <div className="min-w-0 flex-1 pt-0.5"><div className="flex items-center justify-between gap-3"><span className="text-sm font-medium">{formatStage(item.stage)}</span><span className="text-xs capitalize text-muted-foreground">{item.status}</span></div>{item.status === "running" ? <Progress value={item.progress} className="mt-2 h-1.5" aria-label={`${item.progress}% ${formatStage(item.stage)} complete`} /> : null}</div>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>

        <div className="space-y-7">
          <Card className="border-border/80 bg-card/70 shadow-none">
            <CardHeader className="flex-row items-start justify-between space-y-0 p-5 pb-3"><div><CardTitle className="text-base">Transcript</CardTitle><p className="mt-1 text-xs text-muted-foreground">The source text behind the shortlist.</p></div><Badge variant="outline" className="capitalize">{project.transcriptStatus}</Badge></CardHeader>
            <CardContent className="p-5 pt-3">
              {project.transcriptText ? <p className="max-w-prose text-sm leading-7 text-muted-foreground">{project.transcriptText}</p> : <div className="flex min-h-24 items-start gap-3 rounded-xl bg-surface/80 p-4 text-sm text-muted-foreground" role="status"><Captions aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" /><div><p className="font-medium text-foreground">Transcript is preparing</p><p className="mt-1 text-xs leading-5">{project.transcriptStatus === "failed" ? "The transcript stage needs attention before clips can be scored." : "We will show the transcript as soon as speech-to-text completes."}</p></div></div>}
            </CardContent>
          </Card>

          <section aria-labelledby="candidate-clips-heading">
            <div className="mb-4 flex items-end justify-between gap-4"><div><p className="eyebrow">Candidate clips</p><h2 id="candidate-clips-heading" className="mt-2 text-xl font-semibold tracking-[-0.035em]">Review the shortlist.</h2><p className="mt-1 text-sm text-muted-foreground">Open a candidate to edit its copy and export settings.</p></div><Badge variant="secondary" className="shrink-0">{project.clips.length} clips</Badge></div>
            {project.clips.length ? <div className="grid gap-4 2xl:grid-cols-2">{project.clips.map((clip) => <ClipCard key={clip.id} clip={clip} />)}</div> : <Card className="border-dashed border-border bg-card/45 shadow-none"><CardContent className="grid min-h-52 place-items-center p-8 text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted"><LoaderCircle aria-hidden="true" className={`size-5 text-muted-foreground ${project.status === "processing" ? "animate-spin" : ""}`} /></span><h3 className="mt-4 font-semibold">No candidate clips yet</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{emptyMessage}</p></div></CardContent></Card>}
          </section>
        </div>
      </div>
    </div>
  );
}
