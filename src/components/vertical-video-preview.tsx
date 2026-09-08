import { Captions } from "lucide-react";
import { cn } from "@/lib/utils";

export function VerticalVideoPreview({
  src,
  hook,
  className,
}: {
  src: string | null;
  hook: string;
  className?: string;
}) {
  if (src) {
    return (
      <video
        src={src}
        controls
        playsInline
        preload="metadata"
        className={cn("aspect-[9/16] w-full rounded-2xl bg-black object-contain", className)}
        aria-label={`Rendered vertical clip preview: ${hook}`}
      />
    );
  }

  return (
    <div className={cn("media-stage relative aspect-[9/16] w-full overflow-hidden rounded-2xl text-white ring-1 ring-white/15", className)} role="img" aria-label={`Sample clip preview artwork: ${hook}`}>
      <div className="media-head" />
      <div className="media-body" />
      <div className="media-caption">{hook}</div>
      <span className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-md bg-black/55 px-2 py-1 text-[10px] font-medium"><Captions aria-hidden="true" className="size-3" /> Preview artwork</span>
    </div>
  );
}
