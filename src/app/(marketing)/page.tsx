import Link from "next/link";
import { ArrowRight, Captions, Clapperboard, ScanFace, Sparkles, UploadCloud } from "lucide-react";
import { HeroProductPreview } from "@/components/hero-product-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const workflow = [
  {
    number: "01",
    title: "Add one long video",
    copy: "Upload an MP4, MOV, or WebM file, or paste a YouTube link you have the right to process.",
  },
  {
    number: "02",
    title: "Review the strongest moments",
    copy: "ClipFactory transcribes the video and ranks self-contained sections by clarity, tension, and payoff.",
  },
  {
    number: "03",
    title: "Polish and export",
    copy: "Choose a caption style, regenerate the hook or title, then download a 1080 × 1920 MP4.",
  },
];

const features = [
  { icon: Sparkles, title: "AI moment scoring", copy: "Scores explain why each section can work as a short clip." },
  { icon: ScanFace, title: "Speaker-aware framing", copy: "Face tracking keeps the active speaker inside a vertical crop, with centre crop as a fallback." },
  { icon: Captions, title: "Caption presets", copy: "Start with bold viral, minimal clean, or podcast captions. Word highlights use timestamp data when available." },
  { icon: Clapperboard, title: "Real render pipeline", copy: "A durable job flow separates AI analysis from storage, FFmpeg processing, and usage accounting." },
];

export default function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="grid-fade absolute inset-0 -z-10 opacity-70" />
        <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-32">
          <div className="max-w-2xl">
            <Badge variant="outline" className="mb-6 gap-2 bg-card px-3 py-1.5 text-xs font-medium shadow-sm">
              <span className="size-1.5 rounded-full bg-primary" /> AI-assisted video clipping
            </Badge>
            <h1 className="text-balance text-5xl font-semibold tracking-[-0.055em] sm:text-6xl lg:text-[4.65rem] lg:leading-[0.98]">
              One long video. Clips people finish.
            </h1>
            <p className="mt-6 max-w-xl text-pretty text-lg leading-8 text-muted-foreground sm:text-xl">
              Find strong moments, frame the speaker, add readable captions, and export vertical clips without rebuilding your edit from scratch.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="min-h-12 rounded-xl px-6 text-base shadow-md">
                <Link href="/sign-up">Create your first clips <ArrowRight aria-hidden="true" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="min-h-12 rounded-xl bg-card px-6 text-base">
                <Link href="/app/dashboard">Open product preview</Link>
              </Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">60 processing credits on the free plan. No card required.</p>
          </div>
          <HeroProductPreview />
        </div>
      </section>

      <section id="workflow" className="border-y border-foreground/10 bg-card/55 py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-primary">A focused workflow</p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">From source video to final clips in three steps</h2>
          </div>
          <ol className="mt-12 grid gap-5 lg:grid-cols-3">
            {workflow.map((item) => (
              <li key={item.number} className="border-t border-foreground/20 pt-5">
                <span className="font-mono text-xs font-semibold text-primary">{item.number}</span>
                <h3 className="mt-7 text-xl font-semibold tracking-tight">{item.title}</h3>
                <p className="mt-3 text-[15px] leading-7 text-muted-foreground">{item.copy}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="features" className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold text-primary">Built for the core job</p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Less editing overhead. More clips you would publish.</h2>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-2">
            {features.map((feature) => (
              <Card key={feature.title} className="border-foreground/12 bg-card/85 shadow-none">
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
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 overflow-hidden rounded-[1.75rem] bg-[#1d1925] px-6 py-10 text-white shadow-soft sm:px-10 sm:py-12 lg:flex-row lg:items-center">
          <div className="max-w-2xl">
            <h2 className="text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Your next video already contains the short.</h2>
            <p className="mt-3 text-base leading-7 text-white/72">Upload it, review the ranked moments, and keep the final editorial call.</p>
          </div>
          <Button asChild size="lg" className="min-h-12 shrink-0 rounded-xl bg-white px-6 text-[#1d1925] hover:bg-white/90">
            <Link href="/sign-up">Start clipping <UploadCloud aria-hidden="true" /></Link>
          </Button>
        </div>
      </section>
    </>
  );
}
