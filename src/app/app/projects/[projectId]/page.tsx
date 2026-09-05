import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectDetailView } from "@/components/project-detail-view";
import { isBackendConfigured, loadProject } from "@/server/app-data";

type Props = { params: Promise<{ projectId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { projectId } = await params;
  const project = await loadProject(projectId);
  return { title: project?.title ?? "Project" };
}

export default async function ProjectPage({ params }: Props) {
  const { projectId } = await params;
  const project = await loadProject(projectId);
  if (!project) notFound();
  return <ProjectDetailView project={project} previewMode={!isBackendConfigured()} />;
}
