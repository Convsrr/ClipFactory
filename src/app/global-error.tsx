"use client";

import { Button } from "@/components/ui/button";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en"><body><main className="grid min-h-screen place-items-center px-4 text-center"><div><h1 className="text-2xl font-semibold">ClipFactory hit an unexpected error</h1><p className="mt-2 text-sm text-muted-foreground">Reload the app. No processing job was deleted.</p><Button className="mt-5" onClick={reset}>Reload</Button></div></main></body></html>
  );
}
