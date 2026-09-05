import Link from "next/link";
import { ArrowUpRight, Clock3 } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { VerticalVideoPreview } from "@/components/vertical-video-preview";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDuration } from "@/lib/format";
import type { ClipSummary } from "@/lib/product-types";

export function ClipCard({ clip }: { clip: ClipSummary }) {
  return (
    <Card className="group overflow-hidden border-foreground/12 bg-card/85 py-0 shadow-none transition-transform hover:-translate-y-0.5">
      <CardContent className="grid gap-5 p-4 sm:grid-cols-[116px_1fr]">
        <VerticalVideoPreview src={clip.previewUrl} hook={clip.hook} className="mx-auto max-w-[116px] rounded-xl" />
        <div className="flex min-w-0 flex-col py-1">
          <div className="flex items-start justify-between gap-3"><StatusBadge status={clip.status} /><Badge variant="secondary" className="font-mono">{clip.score}/100</Badge></div>
          <h3 className="mt-4 line-clamp-2 font-semibold tracking-tight">{clip.title}</h3>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{clip.hook}</p>
          <div className="mt-auto flex items-end justify-between gap-3 pt-5">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 aria-hidden="true" className="size-3.5" />{formatDuration(clip.durationSec)} · {clip.category}</span>
            <Link href={`/app/projects/${clip.projectId}/clips/${clip.id}`} className="grid size-11 place-items-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label={`Open ${clip.title}`}><ArrowUpRight aria-hidden="true" className="size-4" /></Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
