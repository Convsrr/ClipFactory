"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const links = [
  { href: "/#workflow", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
];

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/82 backdrop-blur-xl">
      <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <BrandMark />
        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary navigation">
          {links.map((link) => (
            <Button key={link.href} asChild variant="ghost" className="min-h-10 rounded-lg px-4 text-muted-foreground">
              <Link href={link.href}>{link.label}</Link>
            </Button>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle />
          <Button asChild variant="ghost" className="min-h-11 px-4">
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild className="min-h-11 rounded-xl px-5 shadow-sm">
            <Link href="/sign-up">Create a clip set</Link>
          </Button>
        </div>
        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <Sheet>
            <SheetTrigger
              className={buttonVariants({ variant: "ghost", size: "icon", className: "size-11 rounded-xl" })}
              aria-label="Open navigation"
            >
              <Menu aria-hidden="true" />
            </SheetTrigger>
            <SheetContent side="right" className="w-[min(22rem,88vw)] border-border bg-popover p-6">
              <SheetHeader className="px-0 text-left">
                <SheetTitle><BrandMark /></SheetTitle>
              </SheetHeader>
              <nav className="mt-8 grid gap-2" aria-label="Mobile navigation">
                {links.map((link) => (
                  <Button key={link.href} asChild variant="ghost" className="min-h-12 justify-start text-base">
                    <Link href={link.href}>{link.label}</Link>
                  </Button>
                ))}
                <div className="my-3 h-px bg-border" />
                <Button asChild variant="outline" className="min-h-12">
                  <Link href="/sign-in">Sign in</Link>
                </Button>
                <Button asChild className="min-h-12">
                  <Link href="/sign-up">Create a clip set</Link>
                </Button>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
