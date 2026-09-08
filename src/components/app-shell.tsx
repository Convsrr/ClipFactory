"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard, FolderKanban, Gauge, Settings2, UserRound } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { LiveSignOut } from "@/components/live-sign-out";
import { ThemeToggle } from "@/components/theme-toggle";
import { UploadDialog } from "@/components/upload-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/app/dashboard", label: "Dashboard", icon: Gauge },
  { href: "/app/projects", label: "Projects", icon: FolderKanban },
  { href: "/app/billing", label: "Billing", icon: CreditCard },
  { href: "/app/settings", label: "Settings", icon: Settings2 },
];

function isActivePath(pathname: string, href: string) {
  return pathname === href || (href === "/app/projects" && pathname.startsWith("/app/projects/"));
}

export function AppShell({
  children,
  previewMode,
  user,
}: {
  children: React.ReactNode;
  previewMode: boolean;
  user: { name: string; email: string; plan: string; creditsRemaining: number };
}) {
  const pathname = usePathname();
  const initials = user.name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  const creditLimit = user.plan === "free" ? 60 : 600;
  const creditPercent = Math.min(100, Math.max(5, (user.creditsRemaining / creditLimit) * 100));

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex h-[4.5rem] items-center border-b border-sidebar-border px-5">
          <BrandMark href="/app/dashboard" className="text-sidebar-foreground" />
        </div>
        <div className="px-4 pt-6">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/45">Workspace</p>
          <nav className="mt-3 space-y-1" aria-label="Workspace navigation">
            {navigation.map((item) => {
              const active = isActivePath(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-sidebar-foreground/65 transition-colors duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    active && "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm",
                  )}
                >
                  <item.icon aria-hidden="true" className={cn("size-[18px]", active ? "text-sidebar-primary" : "text-sidebar-foreground/55")} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto px-4 pb-5">
          <div className="rounded-2xl border border-sidebar-border bg-sidebar-accent/55 p-4">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-sidebar-foreground/60">Credits left</span>
              <span className="font-mono font-semibold tabular-nums">{user.creditsRemaining}</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/25" aria-hidden="true">
              <div className="h-full rounded-full bg-sidebar-primary transition-[width] duration-300" style={{ width: `${creditPercent}%` }} />
            </div>
            <Button asChild variant="link" className="mt-2 h-auto min-h-8 px-0 text-xs text-sidebar-primary">
              <Link href="/app/billing">Review usage</Link>
            </Button>
          </div>
          <p className="px-1 pt-4 text-[11px] leading-5 text-sidebar-foreground/45">One credit covers one minute of source video.</p>
        </div>
      </aside>

      <div className="lg:pl-60">
        {previewMode ? (
          <div role="status" className="flex min-h-9 items-center justify-center gap-2 border-b border-primary/25 bg-primary/10 px-4 py-2 text-center text-xs text-foreground">
            <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
            <span><strong className="font-semibold">Preview workspace</strong> · Sample projects stay separate from live accounts and billing.</span>
          </div>
        ) : null}

        <header className="sticky top-0 z-30 flex min-h-[4.5rem] items-center justify-between border-b border-border/70 bg-background/88 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="lg:hidden"><BrandMark href="/app/dashboard" /></div>
            <div className="hidden lg:block">
              <p className="text-sm font-semibold">Creator workspace</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Turn source videos into vertical clips.</p>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <div className="sm:hidden"><UploadDialog previewMode={previewMode} compact /></div>
            <div className="hidden sm:block"><UploadDialog previewMode={previewMode} /></div>
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger
                className={buttonVariants({ variant: "ghost", className: "size-11 rounded-xl p-0" })}
                aria-label="Open account menu"
              >
                <Avatar className="size-9"><AvatarFallback className="bg-accent text-xs font-semibold text-accent-foreground">{initials || <UserRound className="size-4" />}</AvatarFallback></Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 p-2">
                <DropdownMenuLabel className="p-2 font-normal">
                  <span className="block truncate text-sm font-semibold">{user.name}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{user.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="flex items-center justify-between px-2 py-2 text-xs text-muted-foreground"><span>Plan</span><Badge variant="secondary" className="capitalize">{user.plan}</Badge></div>
                <DropdownMenuSeparator />
                {previewMode ? <Button asChild variant="ghost" className="min-h-11 w-full justify-start"><Link href="/">Leave preview</Link></Button> : <LiveSignOut />}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main id="main-content" className="mx-auto w-full max-w-[1440px] px-4 py-7 pb-28 sm:px-6 sm:py-9 lg:px-8 lg:pb-12">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-border/80 bg-background/92 px-[max(0.5rem,env(safe-area-inset-left))] pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur-xl lg:hidden" aria-label="Mobile workspace navigation">
        {navigation.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn("flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-2 text-[11px] font-medium text-muted-foreground transition-colors duration-200", active && "bg-accent/70 text-foreground")}
            >
              <item.icon aria-hidden="true" className={cn("size-5", active && "text-primary")} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
