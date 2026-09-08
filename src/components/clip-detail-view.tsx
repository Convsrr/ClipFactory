import Link from "next/link";
import { ArrowLeft, Clock3, Scissors, Sparkles, type LucideIcon } from "lucide-react";
import { ClipEditor } from "@/components/clip-editor";
import { StatusBadge } from "@/components/status-badge";
import { VerticalVideoPreview } from "@/components/vertical-video-preview";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDuration } from "@/lib/format";
import type { ClipSummary } from "@/lib/product-types";

export function ClipDetailView({ clip, previewMode }: { clip: ClipSummary; previewMode: boolean }) {
  return (
    <div className="space-y-8">
      <Link href={`/app/projects/${clip.projectId}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft aria-hidden="true" className="size-4" /> Back to project</Link>

      <section className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><StatusBadge status={clip.status} />{previewMode ? <Badge variant="outline">Sample clip</Badge> : null}<Badge variant="secondary">{clip.category}</Badge></div>
          <h1 className="mt-4 max-w-3xl text-balance text-3xl font-semibold tracking-[-0.055em] sm:text-4xl">{clip.title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Shape the copy, check the caption treatment, and download the finished vertical cut when it is ready.</p>
        </div>
        <div className="flex size-20 shrink-0 flex-col items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-soft"><span className="text-2xl font-semibold tabular-nums">{clip.score}</span><span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]">AI score</span></div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(280px,0.7fr)_minmax(0,1.3fr)]">
        <div className="mx-auto w-full max-w-[420px] xl:mx-0">
          <VerticalVideoPreview src={clip.finalUrl ?? clip.previewUrl} hook={clip.hook} />
          <p className="mt-3 text-center text-xs text-muted-foreground">Vertical preview · 1080 × 1920 export</p>
        </div>

        <div className="space-y-5">
          <section className="grid gap-3 sm:grid-cols-3" aria-label="Clip details">
            <DetailStat icon={Clock3} label="Duration" value={formatDuration(clip.durationSec)} />
            <DetailStat icon={Scissors} label="Source range" value={`${formatDuration(clip.startSec)}–${formatDuration(clip.endSec)}`} />
            <DetailStat icon={Sparkles} label="AI score" value={`${clip.score}/100`} />
          </section>
          <Card className="border-border/80 bg-card/70 shadow-none"><CardHeader className="p-5 pb-3"><CardTitle className="text-base">Transcript excerpt</CardTitle></CardHeader><CardContent className="p-5 pt-2"><blockquote className="max-w-prose border-l-2 border-primary pl-4 text-sm leading-7 text-muted-foreground">“{clip.transcriptExcerpt}”</blockquote></CardContent></Card>
          <ClipEditor clip={clip} previewMode={previewMode} />
        </div>
      </div>
    </div>
  );
}

function DetailStat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <Card size="sm" className="border-border/80 bg-card/70 shadow-none"><CardContent className="p-4"><Icon aria-hidden="true" className="size-4 text-primary" /><p className="mt-3 text-xs text-muted-foreground">{label}</p><p className="mt-1 font-mono text-sm font-semibold tabular-nums">{value}</p></CardContent></Card>
  );
}
