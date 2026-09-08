import type { Metadata } from "next";
import { Bot, HardDrive, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loadDashboard } from "@/server/app-data";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const data = await loadDashboard();

  return (
    <div className="space-y-8">
      <section><p className="eyebrow">Account</p><h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">Settings</h1><p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Manage your profile and see how ClipFactory handles source media.</p></section>

      <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <Card className="border-border/80 bg-card/70 shadow-none"><CardHeader className="p-6 pb-3"><CardTitle className="text-base">Profile</CardTitle><p className="text-xs text-muted-foreground">Your workspace identity.</p></CardHeader><CardContent className="space-y-5 p-6 pt-3"><div className="space-y-2"><Label htmlFor="settings-name">Name</Label><Input id="settings-name" autoComplete="name" className="h-12" defaultValue={data.user.name} disabled={data.mode === "preview"} /></div><div className="space-y-2"><Label htmlFor="settings-email">Email</Label><Input id="settings-email" type="email" autoComplete="email" className="h-12" value={data.user.email} disabled /></div>{data.mode === "preview" ? <p className="border-t border-border/70 pt-4 text-xs leading-5 text-muted-foreground">Sample account fields stay read-only until you connect Convex Auth.</p> : null}</CardContent></Card>

        <div className="space-y-4">
          {[
            { icon: ShieldCheck, title: "Private media", copy: "Upload signing creates short-lived object-store URLs. ClipFactory does not store signed upload URLs in Convex." },
            { icon: Bot, title: "AI analysis", copy: "g0i.ai receives transcript chunks for clip scoring and metadata. The worker handles media files and FFmpeg rendering." },
            { icon: HardDrive, title: "Storage and deletion", copy: "R2 stores source and rendered assets. Account deletion and retention controls remain a launch task.", badge: "TODO" },
          ].map((item) => <Card key={item.title} className="border-border/80 bg-card/70 shadow-none"><CardContent className="flex gap-4 p-5"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground"><item.icon aria-hidden="true" className="size-4" /></span><div><div className="flex items-center gap-2"><h2 className="text-sm font-semibold">{item.title}</h2>{item.badge ? <Badge variant="outline">{item.badge}</Badge> : null}</div><p className="mt-2 text-xs leading-5 text-muted-foreground">{item.copy}</p></div></CardContent></Card>)}
        </div>
      </div>
    </div>
  );
}
