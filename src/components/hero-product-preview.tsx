import { Captions, Check, ScanFace, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const checks = [
  { icon: Check, label: "Moment selected", value: 100 },
  { icon: ScanFace, label: "Speaker framed", value: 100 },
  { icon: Captions, label: "Caption pass", value: 78 },
];

export function HeroProductPreview() {
  return (
    <div
      className="relative mx-auto w-full max-w-[640px]"
      role="img"
      aria-label="ClipFactory sample workspace showing a ranked vertical clip and processing checks"
    >
      <div className="absolute inset-x-12 -inset-y-8 -z-10 rounded-[3rem] bg-primary/12 blur-3xl" />
      <div className="overflow-hidden rounded-[1.6rem] border border-foreground/12 bg-card shadow-soft">
        <div className="flex items-center justify-between border-b border-border/80 bg-surface/70 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2" aria-hidden="true">
            <span className="size-2 rounded-full bg-foreground/25" />
            <span className="size-2 rounded-full bg-foreground/15" />
            <span className="size-2 rounded-full bg-foreground/10" />
            <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">ClipFactory / sample</span>
          </div>
          <Badge variant="outline" className="gap-1.5 bg-background text-[11px] font-medium">
            <Sparkles aria-hidden="true" className="size-3 text-primary" /> Ranked moment
          </Badge>
        </div>

        <div className="grid gap-5 p-4 sm:grid-cols-[0.76fr_1.24fr] sm:p-5">
          <div className="media-stage relative mx-auto aspect-[9/16] w-full max-w-[220px] overflow-hidden rounded-[1.25rem] ring-1 ring-white/15">
            <div className="media-head" />
            <div className="media-body" />
            <div className="media-caption">
              Your first users can hide the <strong>real signal</strong>
            </div>
            <div className="absolute inset-x-3 bottom-3 flex items-center justify-between font-mono text-[9px] text-white/70">
              <span>00:18</span>
              <span>00:44</span>
            </div>
          </div>

          <div className="flex min-w-0 flex-col justify-between gap-6 py-1 sm:py-2">
            <div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="eyebrow">Top candidate</p>
                  <h3 className="mt-2 text-lg font-semibold tracking-tight sm:text-xl">The launch metric founders miss</h3>
                </div>
                <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">92</div>
              </div>
              <p className="mt-5 rounded-xl border border-border bg-surface/80 p-3.5 text-sm font-medium leading-5">
                “Your first 100 users are giving you the wrong signal.”
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 border-y border-border/70 py-4 text-xs">
              <div>
                <p className="text-muted-foreground">Format</p>
                <p className="mt-1 font-medium">9:16</p>
              </div>
              <div>
                <p className="text-muted-foreground">Length</p>
                <p className="mt-1 font-mono font-medium">00:44</p>
              </div>
              <div>
                <p className="text-muted-foreground">Status</p>
                <p className="mt-1 font-medium text-primary">Ready</p>
              </div>
            </div>

            <div className="space-y-3">
              {checks.map((item) => (
                <div key={item.label}>
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                    <span className="flex items-center gap-2 font-medium">
                      <item.icon aria-hidden="true" className="size-3.5 text-primary" />
                      {item.label}
                    </span>
                    <span className="font-mono tabular-nums text-muted-foreground">{item.value}%</span>
                  </div>
                  <Progress value={item.value} className="h-1.5" aria-label={`${item.label}: ${item.value}%`} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
