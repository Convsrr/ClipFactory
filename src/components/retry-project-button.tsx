"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function RetryProjectButton({ projectId, disabled }: { projectId: string; disabled: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function retry() {
    setPending(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/retry`, { method: "POST" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Project retry failed.");
      toast.success("Processing restarted from the failed stage.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Project retry failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button type="button" variant="outline" className="min-h-11" onClick={retry} disabled={disabled || pending}>
      {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <RotateCcw aria-hidden="true" />}
      {pending ? "Retrying…" : "Retry failed stage"}
    </Button>
  );
}
