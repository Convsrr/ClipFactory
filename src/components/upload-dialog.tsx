"use client";

import { DragEvent, FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileVideo2, Link2, LoaderCircle, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);

export function UploadDialog({ previewMode, compact = false }: { previewMode: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={buttonVariants({ className: cn("min-h-11 rounded-xl", compact ? "size-11 px-0" : "px-4") })}
        aria-label={compact ? "New project" : undefined}
      >
        <UploadCloud aria-hidden="true" />{compact ? null : "New project"}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-popover p-5 sm:max-w-xl sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-xl tracking-[-0.03em]">Create a clip project</DialogTitle>
          <DialogDescription>Start with a source video. We will bring the candidate moments back to this workspace.</DialogDescription>
        </DialogHeader>
        {previewMode ? (
          <Alert className="mt-2 border-primary/30 bg-primary/10">
            <AlertTitle>Preview workspace</AlertTitle>
            <AlertDescription>Uploads are disabled here. Configure Convex, R2, and the worker service to process your own source.</AlertDescription>
          </Alert>
        ) : null}
        <UploadTabs disabled={previewMode} onComplete={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function UploadTabs({ disabled, onComplete }: { disabled: boolean; onComplete: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState(0);

  function acceptFile(candidate: File | undefined) {
    if (!candidate) return;
    if (!ACCEPTED_TYPES.has(candidate.type)) {
      toast.error("Choose an MP4, MOV, or WebM video.");
      return;
    }
    if (candidate.size > MAX_FILE_SIZE) {
      toast.error("The file is larger than 5 GB.");
      return;
    }
    setFile(candidate);
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    acceptFile(event.dataTransfer.files[0]);
  }

  async function uploadFile() {
    if (!file) return;
    setPending(true);
    setProgress(3);
    try {
      const signResponse = await fetch("/api/uploads/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, mimeType: file.type, fileSizeBytes: file.size }),
      });
      const target = await signResponse.json();
      if (!signResponse.ok) throw new Error(target.error ?? "Could not prepare the upload.");

      await putFile(target.uploadUrl, file, setProgress);
      const projectResponse = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceType: "upload", title: file.name.replace(/\.[^.]+$/, ""), objectKey: target.objectKey, sourceFilename: file.name, mimeType: file.type, fileSizeBytes: file.size }),
      });
      const project = await projectResponse.json();
      if (!projectResponse.ok) throw new Error(project.error ?? "Could not create the project.");
      setProgress(100);
      toast.success("Upload complete. Processing has started.");
      onComplete();
      router.push(`/app/projects/${project.projectId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setPending(false);
    }
  }

  async function submitYoutube(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceType: "youtube", title: formData.get("title"), youtubeUrl: formData.get("youtubeUrl") }),
      });
      const project = await response.json();
      if (!response.ok) throw new Error(project.error ?? "Could not create the project.");
      toast.success("YouTube source added. Processing has started.");
      onComplete();
      router.push(`/app/projects/${project.projectId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add that link.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Tabs defaultValue="upload" className="mt-4">
      <TabsList className="grid h-12 w-full grid-cols-2 bg-muted/80">
        <TabsTrigger value="upload" className="min-h-9"><FileVideo2 aria-hidden="true" /> Upload</TabsTrigger>
        <TabsTrigger value="youtube" className="min-h-9"><Link2 aria-hidden="true" /> YouTube link</TabsTrigger>
      </TabsList>
      <TabsContent value="upload" className="mt-5 space-y-4">
        <button
          type="button"
          aria-label={file ? `Selected video: ${file.name}` : "Choose or drop a video file"}
          disabled={disabled || pending}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={cn("flex min-h-56 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-input bg-surface/80 p-6 text-center transition-colors duration-200 hover:border-primary hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-55", dragging && "border-primary bg-accent/55")}
        >
          <span className="grid size-12 place-items-center rounded-2xl bg-card shadow-sm"><UploadCloud aria-hidden="true" className="size-5 text-primary" /></span>
          <span className="mt-4 max-w-full truncate px-3 text-sm font-semibold">{file ? file.name : "Drop a video here or choose a file"}</span>
          <span className="mt-1 text-xs leading-5 text-muted-foreground">MP4, MOV, or WebM · up to 5 GB</span>
        </button>
        <Input ref={inputRef} className="sr-only" type="file" accept="video/mp4,video/quicktime,video/webm" tabIndex={-1} onChange={(event) => acceptFile(event.target.files?.[0])} />
        {pending ? <div className="space-y-2" role="status" aria-live="polite"><div className="flex justify-between text-xs text-muted-foreground"><span>Uploading source</span><span className="font-mono tabular-nums">{progress}%</span></div><Progress value={progress} aria-label={`${progress}% uploaded`} /></div> : null}
        <Button type="button" className="min-h-12 w-full rounded-xl" disabled={!file || disabled || pending} onClick={uploadFile}>
          {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null} Upload and process
        </Button>
      </TabsContent>
      <TabsContent value="youtube" className="mt-5">
        <form className="space-y-4" onSubmit={submitYoutube}>
          <div className="space-y-2"><Label htmlFor="project-title">Project title</Label><Input id="project-title" name="title" required disabled={disabled || pending} className="h-12" placeholder="Founder podcast, episode 12" /></div>
          <div className="space-y-2"><Label htmlFor="youtube-url">YouTube URL</Label><Input id="youtube-url" name="youtubeUrl" type="url" required disabled={disabled || pending} className="h-12" placeholder="https://www.youtube.com/watch?v=…" /></div>
          <p className="text-xs leading-5 text-muted-foreground">You must own the video or have permission to download and process it.</p>
          <Button type="submit" className="min-h-12 w-full rounded-xl" disabled={disabled || pending}>{pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null} Add and process</Button>
        </form>
      </TabsContent>
    </Tabs>
  );
}

function putFile(uploadUrl: string, file: File, onProgress: (value: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", uploadUrl);
    request.setRequestHeader("Content-Type", file.type);
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(Math.max(5, Math.round((event.loaded / event.total) * 94)));
    });
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error("Object storage rejected the upload."));
    });
    request.addEventListener("error", () => reject(new Error("The upload connection failed.")));
    request.send(file);
  });
}
