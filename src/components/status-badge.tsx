import { AlertCircle, CheckCircle2, Clock3, LoaderCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusMap = {
  draft: { label: "Draft", icon: Clock3, className: "border-border bg-muted text-muted-foreground" },
  queued: { label: "Queued", icon: Clock3, className: "border-amber-600/40 bg-amber-500/10 text-amber-800 dark:text-amber-300" },
  processing: { label: "Processing", icon: LoaderCircle, className: "border-blue-600/40 bg-blue-500/10 text-blue-800 dark:text-blue-300" },
  running: { label: "Running", icon: LoaderCircle, className: "border-blue-600/40 bg-blue-500/10 text-blue-800 dark:text-blue-300" },
  complete: { label: "Ready", icon: CheckCircle2, className: "border-emerald-600/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300" },
  failed: { label: "Needs attention", icon: AlertCircle, className: "border-red-600/40 bg-red-500/10 text-red-800 dark:text-red-300" },
} as const;

export function StatusBadge({ status, className }: { status: keyof typeof statusMap; className?: string }) {
  const item = statusMap[status];
  return (
    <Badge variant="outline" className={cn("gap-1.5 py-1 font-medium", item.className, className)}>
      <item.icon aria-hidden="true" className={cn("size-3.5", status === "processing" || status === "running" ? "animate-spin" : "")} />
      {item.label}
    </Badge>
  );
}
