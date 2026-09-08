import { AlertCircle, CheckCircle2, Clock3, LoaderCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusMap = {
  draft: { label: "Draft", icon: Clock3, className: "border-border bg-muted text-foreground/75", iconClass: "text-muted-foreground" },
  queued: { label: "Queued", icon: Clock3, className: "border-warning/45 bg-warning/10 text-foreground", iconClass: "text-warning" },
  processing: { label: "Processing", icon: LoaderCircle, className: "border-info/45 bg-info/10 text-foreground", iconClass: "text-info" },
  running: { label: "Running", icon: LoaderCircle, className: "border-info/45 bg-info/10 text-foreground", iconClass: "text-info" },
  complete: { label: "Ready", icon: CheckCircle2, className: "border-success/45 bg-success/10 text-foreground", iconClass: "text-success" },
  failed: { label: "Needs attention", icon: AlertCircle, className: "border-destructive/45 bg-destructive/10 text-foreground", iconClass: "text-destructive" },
} as const;

export function StatusBadge({ status, className }: { status: keyof typeof statusMap; className?: string }) {
  const item = statusMap[status];
  return (
    <Badge variant="outline" className={cn("gap-1.5 py-1 font-medium", item.className, className)}>
      <item.icon aria-hidden="true" className={cn("size-3.5", item.iconClass, status === "processing" || status === "running" ? "animate-spin" : "")} />
      {item.label}
    </Badge>
  );
}
