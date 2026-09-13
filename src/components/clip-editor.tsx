"use client";

import { useState } from "react";
import { Download, Gamepad2, LoaderCircle, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ClipSummary } from "@/lib/product-types";

type Field = "hook" | "title" | "description";

export function ClipEditor({ clip, previewMode }: { clip: ClipSummary; previewMode: boolean }) {
  const [hook, setHook] = useState(clip.hook);
  const [title, setTitle] = useState(clip.title);
  const [description, setDescription] = useState(clip.description);
  const [captionStyle, setCaptionStyle] = useState(clip.captionStyle);
  const [renderMode, setRenderMode] = useState(clip.renderMode);
  const [showHook, setShowHook] = useState(clip.showHook);
  const [showCta, setShowCta] = useState(clip.showCta);
  const [ctaText, setCtaText] = useState(clip.ctaText);
  const [gameplayFile, setGameplayFile] = useState<File | null>(null);
  const [gameplayObjectKey, setGameplayObjectKey] = useState<string | undefined>(undefined);
  const [audioTrackIndex, setAudioTrackIndex] = useState(clip.audioTrackIndex);
  const [pending, setPending] = useState<Field | null>(null);
  const [renderPending, setRenderPending] = useState(false);

  async function regenerate(field: Field) {
    setPending(field);
    try {
      const response = await fetch(`/api/clips/${clip.id}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? `Could not regenerate the ${field}.`);
      if (field === "hook") setHook(result.value);
      if (field === "title") setTitle(result.value);
      if (field === "description") setDescription(result.value);
      toast.success(`${field[0].toUpperCase()}${field.slice(1)} regenerated`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Could not regenerate the ${field}.`);
    } finally {
      setPending(null);
    }
  }

  async function queueRender() {
    setRenderPending(true);
    try {
      let nextGameplayObjectKey = gameplayObjectKey;
      if (gameplayFile) {
        const signResponse = await fetch(`/api/clips/${clip.id}/gameplay/presign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: gameplayFile.name, mimeType: gameplayFile.type, fileSizeBytes: gameplayFile.size }),
        });
        const target = await signResponse.json();
        if (!signResponse.ok) throw new Error(target.error ?? "Could not prepare the gameplay upload.");
        const uploadResponse = await fetch(target.uploadUrl, { method: "PUT", headers: { "Content-Type": gameplayFile.type }, body: gameplayFile });
        if (!uploadResponse.ok) throw new Error("Gameplay upload failed.");
        nextGameplayObjectKey = target.objectKey;
        setGameplayObjectKey(target.objectKey);
      }
      const response = await fetch(`/api/clips/${clip.id}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hook, title, description, captionPresetKey: captionStyle, renderMode, showHook, showCta, ctaText, audioTrackIndex, ...(nextGameplayObjectKey ? { gameplayObjectKey: nextGameplayObjectKey } : {}) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not queue the render.");
      toast.success("New render queued");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not queue the render.");
    } finally {
      setRenderPending(false);
    }
  }

  return (
    <div className="space-y-5">
      {previewMode ? <Alert><Sparkles aria-hidden="true" /><div><AlertTitle>Sample AI output</AlertTitle><AlertDescription>Connect g0i.ai and Convex to regenerate this metadata. Sample content never affects credits or live projects.</AlertDescription></div></Alert> : null}

      <Card className="border-border/80 bg-card/70 shadow-none">
        <CardHeader className="flex-row items-start justify-between space-y-0 p-5 pb-3"><div><CardTitle className="text-base">Clip copy</CardTitle><p className="mt-1 text-xs text-muted-foreground">These lines appear before someone decides to keep watching.</p></div><Badge variant="outline">{previewMode ? "Sample" : "Editable"}</Badge></CardHeader>
        <CardContent className="space-y-5 p-5 pt-3">
          <EditorField id="clip-hook" label="Hook" value={hook} onChange={setHook} onRegenerate={() => regenerate("hook")} pending={pending === "hook"} disabled={previewMode} />
          <EditorField id="clip-title" label="Title" value={title} onChange={setTitle} onRegenerate={() => regenerate("title")} pending={pending === "title"} disabled={previewMode} />
          <EditorField id="clip-description" label="Description" value={description} onChange={setDescription} onRegenerate={() => regenerate("description")} pending={pending === "description"} disabled={previewMode} rows={4} />
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card/70 shadow-none">
        <CardHeader className="flex-row items-start justify-between space-y-0 p-5 pb-3"><div><CardTitle className="text-base">Video treatment</CardTitle><p className="mt-1 text-xs text-muted-foreground">Choose framing, captions, and retention overlays.</p></div><Badge variant="secondary">9:16</Badge></CardHeader>
        <CardContent className="space-y-5 p-5 pt-3">
          <div>
            <Label htmlFor="render-mode">Framing mode</Label>
            <Select value={renderMode} onValueChange={(value) => setRenderMode(value as ClipSummary["renderMode"])} disabled={previewMode}>
              <SelectTrigger id="render-mode" className="mt-2 h-12 w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="auto">Auto face tracking</SelectItem><SelectItem value="fit">Full frame + blur</SelectItem><SelectItem value="sports">Sports action tracking</SelectItem><SelectItem value="gameplay">Game video split</SelectItem></SelectContent>
            </Select>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">Sports mode asks the tracking provider to follow the play; if tracking is unavailable, the full frame stays visible.</p>
          </div>
          <Label htmlFor="caption-style">Preset</Label>
          <Select value={captionStyle} onValueChange={(value) => setCaptionStyle(value as ClipSummary["captionStyle"])} disabled={previewMode}>
            <SelectTrigger id="caption-style" className="mt-2 h-12 w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="bold-viral">Bold viral</SelectItem><SelectItem value="minimal-clean">Minimal clean</SelectItem><SelectItem value="podcast">Podcast</SelectItem></SelectContent>
          </Select>
          <p className="text-xs leading-5 text-muted-foreground">Word highlights use timestamp data when it is available.</p>
          <div><Label htmlFor="audio-track">Original audio track</Label><Select value={String(audioTrackIndex)} onValueChange={(value) => setAudioTrackIndex(Number(value))} disabled={previewMode}><SelectTrigger id="audio-track" className="mt-2 h-12 w-full"><SelectValue /></SelectTrigger><SelectContent>{[0, 1, 2, 3].map((index) => <SelectItem key={index} value={String(index)}>Track {index + 1}</SelectItem>)}</SelectContent></Select><p className="mt-2 text-xs text-muted-foreground">Use another embedded source track when the video provides alternate audio.</p></div>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"><input type="checkbox" className="size-5 accent-primary" checked={showHook} onChange={(event) => setShowHook(event.target.checked)} disabled={previewMode} /> Show hook title for the opening four seconds</label>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"><input type="checkbox" className="size-5 accent-primary" checked={showCta} onChange={(event) => setShowCta(event.target.checked)} disabled={previewMode} /> Add an end-of-clip CTA</label>
          {showCta ? <div><Label htmlFor="cta-text">CTA text</Label><Textarea id="cta-text" value={ctaText} rows={2} maxLength={120} onChange={(event) => setCtaText(event.target.value)} className="mt-2 resize-none" disabled={previewMode} /></div> : null}
          {renderMode === "gameplay" ? <div className="rounded-xl border border-border/80 p-4"><Label htmlFor="gameplay-video" className="flex items-center gap-2"><Gamepad2 aria-hidden="true" className="size-4" /> Gameplay video</Label><input id="gameplay-video" type="file" accept="video/mp4,video/quicktime,video/webm" className="mt-3 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-secondary-foreground" onChange={(event) => setGameplayFile(event.target.files?.[0] ?? null)} disabled={previewMode || renderPending} /><p className="mt-2 text-xs text-muted-foreground">The source appears on top and this looping gameplay video fills the lower half.</p></div> : null}
          <Button className="min-h-12 w-full rounded-xl" onClick={queueRender} disabled={previewMode || renderPending || (renderMode === "gameplay" && !gameplayFile && !clip.hasGameplayVideo)}>{renderPending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <RotateCcw aria-hidden="true" />} {renderPending ? "Uploading and queuing" : "Queue new render"}</Button>
        </CardContent>
      </Card>

      {clip.finalUrl ? <Button asChild size="lg" className="min-h-12 w-full rounded-xl"><a href={clip.finalUrl} download><Download aria-hidden="true" /> Download MP4</a></Button> : <Button size="lg" className="min-h-12 w-full rounded-xl" disabled title="The final render is not available yet"><Download aria-hidden="true" /> Final render pending</Button>}
    </div>
  );
}

function EditorField({ id, label, value, onChange, onRegenerate, pending, disabled, rows = 3 }: { id: string; label: string; value: string; onChange: (value: string) => void; onRegenerate: () => void; pending: boolean; disabled: boolean; rows?: number }) {
  return (
    <div aria-busy={pending}>
      <div className="flex items-center justify-between gap-3"><Label htmlFor={id}>{label}</Label><Button type="button" variant="ghost" className="min-h-11 px-3 text-xs" onClick={onRegenerate} disabled={disabled || pending}>{pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Sparkles aria-hidden="true" />} {pending ? "Generating" : "Regenerate"}</Button></div>
      <Textarea id={id} value={value} rows={rows} onChange={(event) => onChange(event.target.value)} className="mt-2 resize-y leading-6" aria-describedby={`${id}-hint`} />
      <p id={`${id}-hint`} className="mt-2 text-xs text-muted-foreground">{label === "Hook" ? "Keep it specific and easy to say out loud." : label === "Title" ? "Use a short title that gives the moment context." : "Add the detail a viewer needs before they open the clip."}</p>
    </div>
  );
}
