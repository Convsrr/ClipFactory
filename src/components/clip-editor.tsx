"use client";

import { useState } from "react";
import { Download, LoaderCircle, RotateCcw, Sparkles } from "lucide-react";
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
        <CardHeader className="flex-row items-start justify-between space-y-0 p-5 pb-3"><div><CardTitle className="text-base">Caption treatment</CardTitle><p className="mt-1 text-xs text-muted-foreground">Choose the visual rhythm for the words on screen.</p></div><Badge variant="secondary">9:16</Badge></CardHeader>
        <CardContent className="p-5 pt-3">
          <Label htmlFor="caption-style">Preset</Label>
          <Select value={captionStyle} onValueChange={(value) => setCaptionStyle(value as ClipSummary["captionStyle"])} disabled={previewMode}>
            <SelectTrigger id="caption-style" className="mt-2 h-12 w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="bold-viral">Bold viral</SelectItem><SelectItem value="minimal-clean">Minimal clean</SelectItem><SelectItem value="podcast">Podcast</SelectItem></SelectContent>
          </Select>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">Word highlights use timestamp data when it is available.</p>
          <Button className="mt-5 min-h-12 w-full rounded-xl" disabled={previewMode || captionStyle === clip.captionStyle}><RotateCcw aria-hidden="true" /> Queue new render</Button>
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
