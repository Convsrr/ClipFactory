import Link from "next/link";
import { ArrowLeft, Captions, Check, Circle, Download, FileVideo2, LoaderCircle, RotateCcw, TvMinimalPlay } from "lucide-react";
import { ClipCard } from "@/components/clip-card";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatDuration, formatStage } from "@/lib/format";
import type { ProjectDetail } from "@/lib/product-types";

export function ProjectDetailView({ project, previewMode }: { project: ProjectDetail; previewMode: boolean }) {
  const SourceIcon = project.sourceType === "youtube" ? TvMinimalPlay : FileVideo2;
  return (
    <div className="space-y-7">
      <div><Button asChild variant="ghost" className="-ml-3 min-h-11"><Link href="/app/projects"><ArrowLeft aria-hidden="true" /> Projects</Link></Button></div>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><StatusBadge status={project.status} />{previewMode ? <Badge variant="outline">Sample project</Badge> : null}</div>
          <h1 className="mt-4 text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{project.title}</h1>
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground"><SourceIcon aria-hidden="true" className="size-4" /><span className="capitalize">{project.sourceType}</span><span aria-hidden="true">·</span><span>{formatDuration(project.durationSec)}</span><span aria-hidden="true">·</span><span>{project.clips.length} candidates</span></p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="min-h-11" disabled={previewMode || project.status === "processing"}><RotateCcw aria-hidden="true" /> Retry failed stage</Button>
          <Button className="min-h-11" disabled={!project.clips.some((clip) => clip.finalUrl)}><Download aria-hidden="true" /> Download all</Button>
        </div>
      </div>

      {project.status === "processing" ? (
        <Card className="border-blue-600/25 bg-blue-500/5 shadow-none"><CardContent className="p-5"><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-semibold">Processing in the background</p><p className="mt-1 text-xs text-muted-foreground">You can leave this page. The project will update after each worker callback.</p></div><span className="font-mono text-sm font-semibold">{project.progress}%</span></div><Progress value={project.progress} className="mt-4" /></CardContent></Card>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[0.66fr_1.34fr]">
        <Card className="border-foreground/12 bg-card/85 shadow-none">
          <CardHeader className="p-5 pb-3"><CardTitle className="text-base">Processing timeline</CardTitle></CardHeader>
          <CardContent className="p-5 pt-2">
            <ol className="space-y-0">
              {project.timeline.map((item, index) => {
                const Icon = item.status === "complete" ? Check : item.status === "running" ? LoaderCircle : Circle;
                return (
                  <li key={item.stage} className="relative flex min-h-14 gap-3 pb-4 last:pb-0">
                    {index < project.timeline.length - 1 ? <span className="absolute left-[11px] top-6 h-[calc(100%-0.25rem)] w-px bg-border" /> : null}
                    <span className={`relative z-10 grid size-6 shrink-0 place-items-center rounded-full border bg-card ${item.status === "complete" ? "border-emerald-600 text-emerald-700 dark:text-emerald-300" : item.status === "running" ? "border-blue-600 text-blue-700 dark:text-blue-300" : "border-border text-muted-foreground"}`}><Icon aria-hidden="true" className={`size-3.5 ${item.status === "running" ? "animate-spin" : ""}`} /></span>
                    <div className="min-w-0 flex-1 pt-0.5"><div className="flex items-center justify-between gap-3"><span className="text-sm font-medium">{formatStage(item.stage)}</span><span className="text-xs capitalize text-muted-foreground">{item.status}</span></div>{item.status === "running" ? <Progress value={item.progress} className="mt-2 h-1.5" /> : null}</div>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card className="border-foreground/12 bg-card/85 shadow-none">
            <CardHeader className="flex-row items-center justify-between space-y-0 p-5 pb-3"><CardTitle className="text-base">Transcript</CardTitle><Badge variant="outline" className="capitalize">{project.transcriptStatus}</Badge></CardHeader>
            <CardContent className="p-5 pt-2">
              {project.transcriptText ? <p className="line-clamp-4 text-sm leading-7 text-muted-foreground">{project.transcriptText}</p> : <div className="flex min-h-24 items-center gap-3 rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground"><Captions aria-hidden="true" className="size-5" />Transcript text will appear after speech-to-text completes.</div>}
            </CardContent>
          </Card>
          <section>
            <div className="mb-4"><h2 className="text-lg font-semibold tracking-tight">Clip candidates</h2><p className="mt-1 text-sm text-muted-foreground">Review each AI-ranked moment before you export it.</p></div>
            {project.clips.length ? <div className="grid gap-4 2xl:grid-cols-2">{project.clips.map((clip) => <ClipCard key={clip.id} clip={clip} />)}</div> : <Card className="border-dashed bg-card/55 shadow-none"><CardContent className="grid min-h-56 place-items-center p-8 text-center"><div><LoaderCircle aria-hidden="true" className="mx-auto size-6 text-muted-foreground" /><h3 className="mt-4 font-semibold">No candidates yet</h3><p className="mt-2 text-sm text-muted-foreground">Candidates appear after transcript analysis completes.</p></div></CardContent></Card>}
          </section>
        </div>
      </div>
    </div>
  );
}
