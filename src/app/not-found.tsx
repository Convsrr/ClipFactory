import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-4 text-center">
      <div className="max-w-md"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground"><SearchX aria-hidden="true" /></span><h1 className="mt-5 text-3xl font-semibold tracking-[-0.04em]">That page is not here</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">The link may have expired, or the project belongs to another workspace.</p><Button asChild className="mt-6 min-h-11"><Link href="/app/dashboard">Open dashboard</Link></Button></div>
    </main>
  );
}
