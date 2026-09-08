import { Skeleton } from "@/components/ui/skeleton";

export default function WorkspaceLoading() {
  return (
    <div className="space-y-8" aria-label="Loading workspace" role="status">
      <div className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-10 w-72 max-w-full" />
        <Skeleton className="h-4 w-[28rem] max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((item) => <Skeleton key={item} className="h-32 rounded-2xl" />)}
      </div>
      <Skeleton className="h-80 rounded-2xl" />
    </div>
  );
}
