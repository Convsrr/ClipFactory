import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";

export function MarketingFooter() {
  return (
    <footer className="border-t border-border/70 bg-card/45">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-12 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div>
          <BrandMark />
          <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
            Find the moments worth sharing. Keep the final cut in your hands.
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted-foreground" aria-label="Footer navigation">
          <Link className="min-h-11 content-center hover:text-foreground" href="/pricing">Pricing</Link>
          <Link className="min-h-11 content-center hover:text-foreground" href="/sign-in">Sign in</Link>
          <Link className="min-h-11 content-center hover:text-foreground" href="/app/settings">Privacy</Link>
        </nav>
      </div>
    </footer>
  );
}
