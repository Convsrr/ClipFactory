"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function WorkspaceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid min-h-[55vh] place-items-center py-12">
      <div className="max-w-md rounded-2xl border bg-card p-6 text-center shadow-sm sm:p-8">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertTriangle aria-hidden="true" />
        </span>
        <p className="eyebrow mt-6">Workspace error</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">The workspace did not load</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Check the connection, then try again.</p>
        <Button className="mt-6 min-h-11 rounded-xl" onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
