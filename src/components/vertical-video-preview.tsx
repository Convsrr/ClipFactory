import { Captions, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
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
        aria-label="Rendered vertical clip preview"
      />
    );
  }

  return (
    <div className={cn("relative aspect-[9/16] w-full overflow-hidden rounded-2xl bg-[#17141e] text-white ring-1 ring-white/12", className)} aria-label="Clip preview placeholder">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_23%,#7867d5_0,#342a48_23%,#17141e_64%)]" />
      <div className="absolute left-1/2 top-[18%] size-[31%] -translate-x-1/2 rounded-full bg-[#d8af91] shadow-[0_0_0_1.2rem_#2b2338]" />
      <div className="absolute inset-x-[18%] top-[40%] h-[37%] rounded-t-[4rem] bg-[#4a445f]" />
      <div className="absolute inset-x-4 bottom-[13%] text-center text-[clamp(0.75rem,2.3vw,1.35rem)] font-black uppercase leading-[1.08] tracking-tight drop-shadow-lg">{hook}</div>
      <Button variant="secondary" size="icon" className="absolute left-1/2 top-1/2 size-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/92 text-[#17141e] hover:bg-white" aria-label="Rendered preview unavailable">
        <Play aria-hidden="true" className="ml-0.5 fill-current" />
      </Button>
      <span className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-md bg-black/55 px-2 py-1 text-[10px] font-medium"><Captions aria-hidden="true" className="size-3" /> Preview artwork</span>
    </div>
  );
}
