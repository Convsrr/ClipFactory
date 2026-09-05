import { Skeleton } from "@/components/ui/skeleton";

export default function WorkspaceLoading() {
  return (
    <div className="space-y-6" aria-label="Loading workspace">
      <div><Skeleton className="h-9 w-64" /><Skeleton className="mt-3 h-4 w-80 max-w-full" /></div>
      <div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-32 rounded-2xl" />)}</div>
      <Skeleton className="h-80 rounded-2xl" />
    </div>
  );
}
