"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function WorkspaceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid min-h-[55vh] place-items-center text-center">
      <div className="max-w-md"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-destructive/10 text-destructive"><AlertTriangle aria-hidden="true" /></span><h1 className="mt-5 text-2xl font-semibold tracking-tight">The workspace did not load</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Check the backend connection, then try the request again.</p><Button className="mt-5 min-h-11" onClick={reset}>Try again</Button></div>
    </div>
  );
}
