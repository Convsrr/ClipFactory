import type { Metadata } from "next";
import { FolderKanban } from "lucide-react";
import { ProjectRow } from "@/components/project-row";
import { UploadDialog } from "@/components/upload-dialog";
import { Card } from "@/components/ui/card";
import { isBackendConfigured, loadProjects } from "@/server/app-data";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const projects = await loadProjects();
  const previewMode = !isBackendConfigured();
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-3xl font-semibold tracking-[-0.04em]">Projects</h1><p className="mt-2 text-sm text-muted-foreground">Track source videos from upload through final render.</p></div>
        <UploadDialog previewMode={previewMode} />
      </div>
      <Card className="overflow-hidden border-foreground/12 bg-card/85 py-0 shadow-none">
        {projects.length ? projects.map((project) => <ProjectRow key={project.id} project={project} />) : (
          <div className="grid min-h-80 place-items-center p-8 text-center"><div><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-muted"><FolderKanban aria-hidden="true" className="size-6 text-muted-foreground" /></span><h2 className="mt-5 text-lg font-semibold">Start with one source video</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Upload a recording or paste a YouTube link. ClipFactory will track each processing stage here.</p><div className="mt-5"><UploadDialog previewMode={previewMode} /></div></div></div>
        )}
      </Card>
    </div>
  );
}
