import Link from "next/link";
import { Clapperboard } from "lucide-react";
import { cn } from "@/lib/utils";

export function BrandMark({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link
      href={href}
      className={cn("group inline-flex min-h-11 items-center gap-2 rounded-lg text-[15px] font-semibold tracking-tight", className)}
      aria-label={href === "/" ? "ClipFactory home" : "ClipFactory workspace"}
    >
      <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm transition-transform duration-200 group-hover:scale-[1.03]">
        <Clapperboard aria-hidden="true" className="size-4" strokeWidth={2.4} />
      </span>
      <span className="leading-none">ClipFactory</span>
    </Link>
  );
}
