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
    <div className="space-y-7">
      <div><h1 className="text-3xl font-semibold tracking-[-0.04em]">Settings</h1><p className="mt-2 text-sm text-muted-foreground">Account details and the services used to process your media.</p></div>
      <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
        <Card className="border-foreground/12 bg-card/85 shadow-none"><CardHeader className="p-5 pb-3"><CardTitle className="text-base">Profile</CardTitle></CardHeader><CardContent className="space-y-4 p-5 pt-2"><div className="space-y-2"><Label htmlFor="settings-name">Name</Label><Input id="settings-name" className="h-12" defaultValue={data.user.name} disabled={data.mode === "preview"} /></div><div className="space-y-2"><Label htmlFor="settings-email">Email</Label><Input id="settings-email" className="h-12" value={data.user.email} disabled /></div>{data.mode === "preview" ? <p className="text-xs text-muted-foreground">Sample account fields stay read-only.</p> : null}</CardContent></Card>
        <div className="space-y-4">
          {[
            { icon: ShieldCheck, title: "Private media", copy: "The upload route creates short-lived R2 URLs. It never stores signed upload URLs in Convex." },
            { icon: Bot, title: "AI analysis", copy: "g0i.ai receives transcript chunks for clip scoring and metadata generation. Worker code handles media files." },
            { icon: HardDrive, title: "Storage and deletion", copy: "R2 stores source and rendered assets. Account deletion and retention controls remain a launch TODO." },
          ].map((item) => <Card key={item.title} className="border-foreground/12 bg-card/85 shadow-none"><CardContent className="flex gap-4 p-5"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted"><item.icon aria-hidden="true" className="size-4 text-primary" /></span><div><div className="flex items-center gap-2"><h2 className="text-sm font-semibold">{item.title}</h2>{item.title === "Storage and deletion" ? <Badge variant="outline">TODO</Badge> : null}</div><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.copy}</p></div></CardContent></Card>)}
        </div>
      </div>
    </div>
  );
}
