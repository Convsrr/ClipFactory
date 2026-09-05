import { Captions, Check, ScanFace, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export function HeroProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[620px]" aria-label="ClipFactory product preview">
      <div className="absolute inset-x-12 -inset-y-8 -z-10 rounded-[3rem] bg-primary/15 blur-3xl" />
      <div className="overflow-hidden rounded-[1.4rem] border border-foreground/15 bg-card shadow-soft">
        <div className="flex items-center justify-between border-b border-border bg-muted/55 px-4 py-3">
          <div className="flex gap-1.5" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-foreground/20" />
            <span className="size-2.5 rounded-full bg-foreground/20" />
            <span className="size-2.5 rounded-full bg-foreground/20" />
          </div>
          <Badge variant="outline" className="gap-1.5 bg-background text-[11px] font-medium">
            <Sparkles aria-hidden="true" className="size-3" /> Product preview
          </Badge>
        </div>
        <div className="grid gap-5 p-4 sm:grid-cols-[0.78fr_1.22fr] sm:p-5">
          <div className="relative mx-auto aspect-[9/16] w-full max-w-[205px] overflow-hidden rounded-[1.25rem] bg-[#17141e] ring-1 ring-white/12">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_22%,#7561d8_0,#312746_24%,#17141e_62%)]" />
            <div className="absolute left-1/2 top-[18%] size-20 -translate-x-1/2 rounded-full bg-[#d8af91] shadow-[0_0_0_14px_#2b2338]" />
            <div className="absolute inset-x-[18%] top-[39%] h-[38%] rounded-t-[3rem] bg-[#45405c]" />
            <div className="absolute inset-x-3 bottom-8 text-center text-[15px] font-black uppercase leading-[1.08] tracking-tight text-white drop-shadow-lg">
              Your first users can hide the <span className="text-[#c9ff61]">real signal</span>
            </div>
            <div className="absolute inset-x-3 bottom-3 flex items-center justify-between text-[9px] font-medium text-white/70">
              <span>00:18</span><span>00:44</span>
            </div>
          </div>
          <div className="flex min-w-0 flex-col justify-between gap-5 py-1">
            <div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Top candidate</p>
                  <h3 className="mt-1 text-base font-semibold tracking-tight">The launch metric founders miss</h3>
                </div>
                <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">92</div>
              </div>
              <p className="mt-4 rounded-xl border border-border bg-muted/55 p-3 text-sm font-medium leading-5">
                “Your first 100 users are giving you the wrong signal.”
              </p>
            </div>
            <div className="space-y-3">
              {[
                { icon: Check, label: "Moment found", value: 100 },
                { icon: ScanFace, label: "Speaker framed", value: 100 },
                { icon: Captions, label: "Captions rendering", value: 78 },
              ].map((item) => (
                <div key={item.label}>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 font-medium"><item.icon aria-hidden="true" className="size-3.5" />{item.label}</span>
                    <span className="tabular-nums text-muted-foreground">{item.value}%</span>
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
