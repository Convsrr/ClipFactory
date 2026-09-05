import Link from "next/link";
import { Clapperboard } from "lucide-react";
import { cn } from "@/lib/utils";

export function BrandMark({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link
      href={href}
      className={cn("inline-flex min-h-11 items-center gap-2 rounded-lg text-[15px] font-semibold tracking-tight", className)}
      aria-label="ClipFactory home"
    >
      <span className="grid size-8 place-items-center rounded-[10px] bg-primary text-primary-foreground shadow-sm">
        <Clapperboard aria-hidden="true" className="size-4" strokeWidth={2.4} />
      </span>
      <span>ClipFactory</span>
    </Link>
  );
}
