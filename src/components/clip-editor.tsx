"use client";

import { useState } from "react";
import { Download, LoaderCircle, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  const [pending, setPending] = useState<Field | null>(null);

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

  return (
    <div className="space-y-5">
      {previewMode ? <Alert><Sparkles aria-hidden="true" /><AlertTitle>Sample AI output</AlertTitle><AlertDescription>Connect g0i.ai and Convex to regenerate this metadata. Sample content never affects credits or live projects.</AlertDescription></Alert> : null}
      <Card className="border-foreground/12 bg-card/85 shadow-none">
        <CardHeader className="p-5 pb-3"><CardTitle className="text-base">Clip copy</CardTitle></CardHeader>
        <CardContent className="space-y-5 p-5 pt-2">
          <EditorField id="clip-hook" label="Hook" value={hook} onChange={setHook} onRegenerate={() => regenerate("hook")} pending={pending === "hook"} disabled={previewMode} />
          <EditorField id="clip-title" label="Title" value={title} onChange={setTitle} onRegenerate={() => regenerate("title")} pending={pending === "title"} disabled={previewMode} />
          <EditorField id="clip-description" label="Description" value={description} onChange={setDescription} onRegenerate={() => regenerate("description")} pending={pending === "description"} disabled={previewMode} rows={4} />
        </CardContent>
      </Card>

      <Card className="border-foreground/12 bg-card/85 shadow-none">
        <CardHeader className="p-5 pb-3"><CardTitle className="text-base">Caption treatment</CardTitle></CardHeader>
        <CardContent className="p-5 pt-2">
          <Label htmlFor="caption-style">Preset</Label>
          <Select value={captionStyle} onValueChange={(value) => setCaptionStyle(value as ClipSummary["captionStyle"])} disabled={previewMode}>
            <SelectTrigger id="caption-style" className="mt-2 h-12 w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="bold-viral">Bold viral</SelectItem><SelectItem value="minimal-clean">Minimal clean</SelectItem><SelectItem value="podcast">Podcast</SelectItem></SelectContent>
          </Select>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">Changing the preset queues a new caption and clip render in live mode.</p>
          <Button className="mt-5 min-h-12 w-full rounded-xl" disabled={previewMode || captionStyle === clip.captionStyle}><RotateCcw aria-hidden="true" /> Queue new render</Button>
        </CardContent>
      </Card>

      {clip.finalUrl ? <Button asChild size="lg" className="min-h-12 w-full rounded-xl"><a href={clip.finalUrl} download><Download aria-hidden="true" /> Download MP4</a></Button> : <Button size="lg" className="min-h-12 w-full rounded-xl" disabled><Download aria-hidden="true" /> Final render pending</Button>}
    </div>
  );
}

function EditorField({ id, label, value, onChange, onRegenerate, pending, disabled, rows = 3 }: { id: string; label: string; value: string; onChange: (value: string) => void; onRegenerate: () => void; pending: boolean; disabled: boolean; rows?: number }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3"><Label htmlFor={id}>{label}</Label><Button type="button" variant="ghost" size="sm" className="min-h-10" onClick={onRegenerate} disabled={disabled || pending}>{pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Sparkles aria-hidden="true" />} Regenerate</Button></div>
      <Textarea id={id} value={value} rows={rows} onChange={(event) => onChange(event.target.value)} className="mt-2 resize-y leading-6" />
    </div>
  );
}
