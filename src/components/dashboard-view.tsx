import Link from "next/link";
import { ArrowRight, Clapperboard, Clock3, Coins, FolderKanban, ShieldCheck, Sparkles } from "lucide-react";
import { ProjectRow } from "@/components/project-row";
import { UploadDialog } from "@/components/upload-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardData } from "@/lib/product-types";

export function DashboardView({ data }: { data: DashboardData }) {
  const recentProjects = data.projects.slice(0, 4);
  const firstName = data.user.name.split(" ")[0] || "there";
  const creditLimit = data.user.plan === "free" ? 60 : 600;
  const creditPercent = Math.min(100, Math.max(5, (data.user.creditsRemaining / creditLimit) * 100));

  const stats = [
    { label: "Credits remaining", value: data.user.creditsRemaining, icon: Coins, note: `${data.user.creditsUsedThisPeriod} used this period` },
    { label: "Projects processing", value: data.processing, icon: Clock3, note: data.processing ? "You can leave this page" : "Queue is clear" },
    { label: "Clips ready", value: data.clipsReady, icon: Clapperboard, note: "Across current projects" },
  ];

  return (
    <div className="space-y-10">
      <section className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Workspace overview</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">Good to see you, {firstName}.</h1>
            {data.mode === "preview" ? <Badge variant="outline">Preview</Badge> : null}
          </div>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Add a source video or open a project to keep shaping the next clip set.</p>
        </div>
        <div className="hidden sm:block"><UploadDialog previewMode={data.mode === "preview"} /></div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Workspace summary">
        {stats.map((stat) => (
          <Card key={stat.label} size="sm" className="border-border/80 bg-card/70 shadow-none">
            <CardContent className="flex items-start justify-between gap-4 p-5">
              <div>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.05em] tabular-nums">{stat.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{stat.note}</p>
              </div>
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground"><stat.icon aria-hidden="true" className="size-4.5" /></span>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="overflow-hidden border-foreground/10 bg-foreground text-background shadow-soft">
          <CardContent className="relative min-h-72 p-6 sm:p-8">
            <div className="absolute -right-16 -top-24 size-72 rounded-full bg-primary/25 blur-3xl" aria-hidden="true" />
            <div className="relative z-10 max-w-lg">
              <div className="flex items-center gap-2 text-sm font-medium text-background/70"><Sparkles aria-hidden="true" className="size-4 text-primary" /> Ready for a new source</div>
              <h2 className="mt-7 text-2xl font-semibold tracking-[-0.045em] sm:text-3xl">Start with the recording. We will find the shape.</h2>
              <p className="mt-3 max-w-md text-sm leading-6 text-background/70">ClipFactory finds candidate moments, keeps the speaker in frame, and brings each render back here for review.</p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <UploadDialog previewMode={data.mode === "preview"} />
                <span className="text-xs text-background/55">MP4, MOV, WebM, or YouTube</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card/70 shadow-none">
          <CardHeader className="flex-row items-start justify-between space-y-0 p-6 pb-3">
            <div><CardTitle className="text-base">Plan usage</CardTitle><p className="mt-1 text-xs text-muted-foreground">Processing balance for this period.</p></div>
            <Badge variant="secondary" className="capitalize">{data.user.plan}</Badge>
          </CardHeader>
          <CardContent className="p-6 pt-4">
            <div className="flex items-end justify-between gap-4"><div><span className="text-4xl font-semibold tracking-[-0.06em] tabular-nums">{data.user.creditsRemaining}</span><span className="ml-2 text-sm text-muted-foreground">credits left</span></div><Coins aria-hidden="true" className="size-5 text-primary" /></div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${data.user.creditsRemaining} credits remaining`} aria-valuemin={0} aria-valuemax={creditLimit} aria-valuenow={data.user.creditsRemaining}><div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${creditPercent}%` }} /></div>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">One credit covers one minute of source video. Processing rounds up to the next minute.</p>
            <Button asChild variant="outline" className="mt-5 min-h-11 w-full"><Link href="/app/billing">Review plan and usage <ArrowRight aria-hidden="true" /></Link></Button>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="recent-projects-heading">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div><p className="eyebrow">Your library</p><h2 id="recent-projects-heading" className="mt-2 text-xl font-semibold tracking-[-0.035em]">Recent projects</h2><p className="mt-1 text-sm text-muted-foreground">Your newest source videos and render states.</p></div>
          <Button asChild variant="ghost" className="min-h-11 shrink-0"><Link href="/app/projects">View all <ArrowRight aria-hidden="true" /></Link></Button>
        </div>
        <Card className="overflow-hidden border-border/80 bg-card/70 py-0 shadow-none">
          {recentProjects.length ? recentProjects.map((project) => <ProjectRow key={project.id} project={project} />) : (
            <div className="grid min-h-56 place-items-center p-8 text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted"><FolderKanban aria-hidden="true" className="size-5 text-muted-foreground" /></span><h3 className="mt-4 font-semibold">No projects yet</h3><p className="mt-2 text-sm text-muted-foreground">Add a video to create your first clip set.</p></div></div>
          )}
        </Card>
      </section>

      <div className="flex items-start gap-3 border-t border-border/70 pt-5 text-xs leading-5 text-muted-foreground"><ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" /><p>Preview projects stay local to this sample workspace. Live uploads, billing, and processing use your connected services.</p></div>
    </div>
  );
}
