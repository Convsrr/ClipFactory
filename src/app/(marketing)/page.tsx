import Link from "next/link";
import { ArrowRight, Captions, Clapperboard, ScanFace, ShieldCheck, Sparkles, UploadCloud } from "lucide-react";
import { HeroProductPreview } from "@/components/hero-product-preview";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const workflow = [
  {
    number: "01",
    title: "Add the recording",
    copy: "Upload an MP4, MOV, or WebM file, or paste a YouTube link you have permission to process.",
  },
  {
    number: "02",
    title: "Review the moments",
    copy: "ClipFactory transcribes the source and ranks sections with a clear point, useful tension, and a payoff.",
  },
  {
    number: "03",
    title: "Shape the final cut",
    copy: "Edit the hook and title, choose a caption treatment, then export a vertical MP4 when the render is ready.",
  },
];

const features = [
  { icon: Sparkles, title: "Moment scoring", copy: "See why each candidate made the list before you spend time polishing it." },
  { icon: ScanFace, title: "Speaker-aware framing", copy: "Keep the active speaker in the vertical crop with a reliable centre-frame fallback." },
  { icon: Captions, title: "Readable captions", copy: "Start with bold viral, minimal clean, or podcast treatments built for short-form viewing." },
  { icon: Clapperboard, title: "A real render queue", copy: "Durable processing handles storage, FFmpeg, usage, and each stage of the export." },
];

export default function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-border/70">
        <div className="grid-fade absolute inset-0 -z-10 opacity-70" />
        <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[0.88fr_1.12fr] lg:px-8 lg:py-28">
          <div className="max-w-2xl">
            <p className="eyebrow flex items-center gap-2">
              <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
              AI-assisted video clipping
            </p>
            <h1 className="mt-6 text-balance text-[clamp(2.8rem,6.5vw,5.4rem)] font-semibold leading-[0.98] tracking-[-0.065em]">
              Turn one recording into clips worth sharing.
            </h1>
            <p className="mt-6 max-w-xl text-pretty text-lg leading-8 text-muted-foreground sm:text-xl">
              Find the moments with a point, keep the speaker in frame, add captions, and make the final editorial call in one focused workspace.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="min-h-12 rounded-xl px-6 text-base shadow-soft">
                <Link href="/sign-up">Create a clip set <ArrowRight aria-hidden="true" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="min-h-12 rounded-xl bg-card/70 px-6 text-base">
                <Link href="/app/dashboard">View sample workspace</Link>
              </Button>
            </div>
            <dl className="mt-9 grid max-w-lg grid-cols-3 gap-4 border-t border-border/80 pt-5 text-xs">
              <div>
                <dt className="text-muted-foreground">Input</dt>
                <dd className="mt-1 font-medium">One long video</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Output</dt>
                <dd className="mt-1 font-medium">9:16 MP4</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Control</dt>
                <dd className="mt-1 font-medium">You approve it</dd>
              </div>
            </dl>
          </div>
          <HeroProductPreview />
        </div>
      </section>

      <section id="workflow" className="border-b border-border/70 bg-surface/45 py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="eyebrow">A focused workflow</p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">From source video to final clips in three steps.</h2>
          </div>
          <ol className="mt-12 grid gap-4 lg:grid-cols-3">
            {workflow.map((item) => (
              <li key={item.number} className="rounded-2xl border border-border/80 bg-card/70 p-6 sm:p-7">
                <span className="font-mono text-xs font-semibold text-primary">{item.number}</span>
                <h3 className="mt-10 text-xl font-semibold tracking-tight">{item.title}</h3>
                <p className="mt-3 text-[15px] leading-7 text-muted-foreground">{item.copy}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="features" className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <p className="eyebrow">Built around the edit</p>
              <h2 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">Automation handles the busywork. You keep the taste.</h2>
            </div>
            <p className="max-w-sm text-sm leading-6 text-muted-foreground sm:text-right">Every candidate stays reviewable. Every render shows its state.</p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-2">
            {features.map((feature) => (
              <Card key={feature.title} className="border-border/80 bg-card/70 shadow-none transition-colors hover:border-primary/50">
                <CardContent className="flex gap-4 p-6 sm:p-7">
                  <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
                    <feature.icon aria-hidden="true" className="size-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold tracking-tight">{feature.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.copy}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-20 sm:px-6 sm:pb-28 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 overflow-hidden rounded-[1.75rem] bg-foreground px-6 py-10 text-background shadow-soft sm:px-10 sm:py-12 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-sm font-medium text-background/70"><ShieldCheck aria-hidden="true" className="size-4 text-primary" /> You stay in control</div>
            <h2 className="mt-5 text-balance text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">Your next useful clip is already in the recording.</h2>
            <p className="mt-3 max-w-xl text-base leading-7 text-background/70">Start with a sample workspace or bring your own source video when you are ready.</p>
          </div>
          <Button asChild size="lg" className="min-h-12 rounded-xl bg-primary px-6 text-base text-primary-foreground hover:bg-primary/85">
            <Link href="/sign-up">Start clipping <UploadCloud aria-hidden="true" /></Link>
          </Button>
        </div>
      </section>
    </>
  );
}
