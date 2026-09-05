import Link from "next/link";
import { ArrowLeft, Clock3, Scissors, Sparkles } from "lucide-react";
import { ClipEditor } from "@/components/clip-editor";
import { StatusBadge } from "@/components/status-badge";
import { VerticalVideoPreview } from "@/components/vertical-video-preview";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDuration } from "@/lib/format";
import type { ClipSummary } from "@/lib/product-types";

export function ClipDetailView({ clip, previewMode }: { clip: ClipSummary; previewMode: boolean }) {
  return (
    <div className="space-y-7">
      <Link href={`/app/projects/${clip.projectId}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft aria-hidden="true" className="size-4" /> Project</Link>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><StatusBadge status={clip.status} />{previewMode ? <Badge variant="outline">Sample clip</Badge> : null}<Badge variant="secondary">{clip.category}</Badge></div><h1 className="mt-4 max-w-3xl text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{clip.title}</h1></div>
        <div className="grid size-20 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground"><span className="text-2xl font-semibold tabular-nums">{clip.score}</span><span className="-mt-4 text-[10px] font-semibold uppercase tracking-wider">score</span></div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(280px,0.72fr)_minmax(0,1.28fr)]">
        <div className="mx-auto w-full max-w-[420px] xl:mx-0"><VerticalVideoPreview src={clip.finalUrl ?? clip.previewUrl} hook={clip.hook} /></div>
        <div className="space-y-5">
          <section className="grid gap-4 sm:grid-cols-3" aria-label="Clip details">
            <Card className="border-foreground/12 bg-card/85 shadow-none"><CardContent className="p-4"><Clock3 aria-hidden="true" className="size-4 text-primary" /><p className="mt-3 text-xs text-muted-foreground">Duration</p><p className="mt-1 font-mono text-sm font-semibold">{formatDuration(clip.durationSec)}</p></CardContent></Card>
            <Card className="border-foreground/12 bg-card/85 shadow-none"><CardContent className="p-4"><Scissors aria-hidden="true" className="size-4 text-primary" /><p className="mt-3 text-xs text-muted-foreground">Source range</p><p className="mt-1 font-mono text-sm font-semibold">{formatDuration(clip.startSec)}–{formatDuration(clip.endSec)}</p></CardContent></Card>
            <Card className="border-foreground/12 bg-card/85 shadow-none"><CardContent className="p-4"><Sparkles aria-hidden="true" className="size-4 text-primary" /><p className="mt-3 text-xs text-muted-foreground">AI score</p><p className="mt-1 font-mono text-sm font-semibold">{clip.score}/100</p></CardContent></Card>
          </section>
          <Card className="border-foreground/12 bg-card/85 shadow-none"><CardHeader className="p-5 pb-3"><CardTitle className="text-base">Transcript excerpt</CardTitle></CardHeader><CardContent className="p-5 pt-2"><blockquote className="border-l-2 border-primary pl-4 text-sm leading-7 text-muted-foreground">“{clip.transcriptExcerpt}”</blockquote></CardContent></Card>
          <ClipEditor clip={clip} previewMode={previewMode} />
        </div>
      </div>
    </div>
  );
}
