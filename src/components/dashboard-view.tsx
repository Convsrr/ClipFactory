import Link from "next/link";
import { ArrowRight, Clapperboard, Clock3, Coins, FolderKanban, Sparkles } from "lucide-react";
import { ProjectRow } from "@/components/project-row";
import { UploadDialog } from "@/components/upload-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardData } from "@/lib/product-types";

export function DashboardView({ data }: { data: DashboardData }) {
  const recentProjects = data.projects.slice(0, 4);
  const firstName = data.user.name.split(" ")[0] || "there";
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><h1 className="text-3xl font-semibold tracking-[-0.04em]">Good to see you, {firstName}</h1>{data.mode === "preview" ? <Badge variant="outline">Preview</Badge> : null}</div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Add a source video or pick up where you left off.</p>
        </div>
        <div className="sm:hidden"><UploadDialog previewMode={data.mode === "preview"} /></div>
      </div>

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Workspace summary">
        {[
          { label: "Credits remaining", value: data.user.creditsRemaining, icon: Coins, note: `${data.user.creditsUsedThisPeriod} used this period` },
          { label: "Projects processing", value: data.processing, icon: Clock3, note: data.processing ? "You can leave this page" : "Queue is clear" },
          { label: "Clips ready", value: data.clipsReady, icon: Clapperboard, note: "Across current projects" },
        ].map((stat) => (
          <Card key={stat.label} className="border-foreground/12 bg-card/85 shadow-none">
            <CardContent className="flex items-start justify-between gap-4 p-5">
              <div><p className="text-sm text-muted-foreground">{stat.label}</p><p className="mt-2 text-3xl font-semibold tracking-[-0.04em] tabular-nums">{stat.value}</p><p className="mt-1 text-xs text-muted-foreground">{stat.note}</p></div>
              <span className="grid size-10 place-items-center rounded-xl bg-accent text-accent-foreground"><stat.icon aria-hidden="true" className="size-4.5" /></span>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="overflow-hidden border-foreground/12 bg-[#1d1925] text-white shadow-soft">
          <CardContent className="relative min-h-72 p-6 sm:p-8">
            <div className="absolute -right-12 -top-20 size-64 rounded-full bg-[#725ce8]/40 blur-3xl" />
            <div className="relative z-10 max-w-md">
              <span className="grid size-11 place-items-center rounded-xl bg-white/12"><Sparkles aria-hidden="true" className="size-5 text-[#cbbfff]" /></span>
              <h2 className="mt-8 text-2xl font-semibold tracking-[-0.035em]">Turn your latest recording into a clip set</h2>
              <p className="mt-3 text-sm leading-6 text-white/72">ClipFactory keeps processing in the background. You can review each candidate when the render finishes.</p>
              <div className="mt-6"><UploadDialog previewMode={data.mode === "preview"} /></div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-foreground/12 bg-card/85 shadow-none">
          <CardHeader className="flex-row items-center justify-between space-y-0 p-5 pb-3"><CardTitle className="text-base">Plan usage</CardTitle><Badge variant="secondary" className="capitalize">{data.user.plan}</Badge></CardHeader>
          <CardContent className="p-5 pt-3">
            <div className="flex items-end justify-between gap-4"><div><span className="text-4xl font-semibold tracking-[-0.05em] tabular-nums">{data.user.creditsRemaining}</span><span className="ml-2 text-sm text-muted-foreground">credits left</span></div><Coins aria-hidden="true" className="size-5 text-primary" /></div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, Math.min(100, (data.user.creditsRemaining / (data.user.plan === "free" ? 60 : 600)) * 100))}%` }} /></div>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">One credit covers one minute of source video. Processing rounds up to the next minute.</p>
            <Button asChild variant="outline" className="mt-5 min-h-11 w-full"><Link href="/app/billing">Review plan and usage</Link></Button>
          </CardContent>
        </Card>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between gap-4"><div><h2 className="text-lg font-semibold tracking-tight">Recent projects</h2><p className="mt-1 text-sm text-muted-foreground">Your newest source videos and render states.</p></div><Button asChild variant="ghost" className="min-h-11"><Link href="/app/projects">View all <ArrowRight aria-hidden="true" /></Link></Button></div>
        <Card className="overflow-hidden border-foreground/12 bg-card/85 py-0 shadow-none">
          {recentProjects.length ? recentProjects.map((project) => <ProjectRow key={project.id} project={project} />) : (
            <div className="grid min-h-56 place-items-center p-8 text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted"><FolderKanban aria-hidden="true" className="size-5 text-muted-foreground" /></span><h3 className="mt-4 font-semibold">No projects yet</h3><p className="mt-2 text-sm text-muted-foreground">Add a video to create your first clip set.</p></div></div>
          )}
        </Card>
      </section>
    </div>
  );
}
