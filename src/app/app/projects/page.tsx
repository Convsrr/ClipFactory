import type { Metadata } from "next";
import { FolderKanban } from "lucide-react";
import { ProjectRow } from "@/components/project-row";
import { UploadDialog } from "@/components/upload-dialog";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { isBackendConfigured, loadProjects } from "@/server/app-data";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const projects = await loadProjects();
  const previewMode = !isBackendConfigured();

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="eyebrow">Your library</p><div className="mt-3 flex flex-wrap items-center gap-2"><h1 className="text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">Projects</h1><Badge variant="secondary">{projects.length}</Badge></div><p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Track each source video from upload through the finished vertical render.</p></div>
        <UploadDialog previewMode={previewMode} />
      </section>

      <Card className="overflow-hidden border-border/80 bg-card/70 py-0 shadow-none">
        {projects.length ? (
          <>
            <div className="hidden grid-cols-[minmax(0,1fr)_130px_150px_28px] gap-4 border-b border-border/75 px-5 py-3 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:grid"><span>Source</span><span>Status</span><span>Progress</span><span /></div>
            {projects.map((project) => <ProjectRow key={project.id} project={project} />)}
          </>
        ) : (
          <div className="grid min-h-80 place-items-center p-8 text-center"><div><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-muted"><FolderKanban aria-hidden="true" className="size-6 text-muted-foreground" /></span><h2 className="mt-5 text-lg font-semibold">Start with one source video</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Upload a recording or paste a YouTube link. ClipFactory will track each processing stage here.</p><div className="mt-5"><UploadDialog previewMode={previewMode} /></div></div></div>
        )}
      </Card>
    </div>
  );
}
