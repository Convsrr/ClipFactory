import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClipDetailView } from "@/components/clip-detail-view";
import { isBackendConfigured, loadClip } from "@/server/app-data";

type Props = { params: Promise<{ projectId: string; clipId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { clipId } = await params;
  const clip = await loadClip(clipId);
  return { title: clip?.title ?? "Clip" };
}

export default async function ClipPage({ params }: Props) {
  const { projectId, clipId } = await params;
  const clip = await loadClip(clipId);
  if (!clip || clip.projectId !== projectId) notFound();
  return <ClipDetailView clip={clip} previewMode={!isBackendConfigured()} />;
}
