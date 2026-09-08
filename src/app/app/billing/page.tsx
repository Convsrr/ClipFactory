import type { Metadata } from "next";
import { Check, Coins, ReceiptText, ShieldCheck } from "lucide-react";
import { BillingActions } from "@/components/billing-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadDashboard } from "@/server/app-data";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage() {
  const data = await loadDashboard();
  const isCreator = data.user.plan === "creator" || data.user.plan === "studio";
  const planFeatures = [isCreator ? "600 processing credits" : "60 processing credits", "1080 × 1920 exports", "Three caption presets"];

  return (
    <div className="space-y-8">
      <section><p className="eyebrow">Account</p><h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">Billing and usage</h1><p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Keep an eye on the minutes available for your next clip set.</p></section>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-primary/55 bg-card/75 shadow-soft ring-1 ring-primary/20">
          <CardHeader className="p-6 pb-4 sm:p-7 sm:pb-4"><div className="flex items-start justify-between gap-3"><div><p className="eyebrow">Current plan</p><CardTitle className="mt-2 text-xl capitalize">{data.user.plan} plan</CardTitle></div><Badge>{isCreator ? "Active" : "Current"}</Badge></div></CardHeader>
          <CardContent className="p-6 pt-2 sm:p-7 sm:pt-2">
            <div className="flex items-end gap-2"><span className="text-4xl font-semibold tracking-[-0.06em]">{isCreator ? "£19" : "£0"}</span><span className="pb-1 text-sm text-muted-foreground">{isCreator ? "per month" : "to start"}</span></div>
            <ul className="mt-7 space-y-3 text-sm">{planFeatures.map((item) => <li key={item} className="flex items-start gap-3"><Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" /><span>{item}</span></li>)}</ul>
            <div className="mt-7"><BillingActions previewMode={data.mode === "preview"} hasSubscription={isCreator} /></div>
            {data.mode === "preview" ? <p className="mt-3 text-xs leading-5 text-muted-foreground">Sample workspace billing stays disabled. Live checkout opens Stripe.</p> : null}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-border/80 bg-card/70 shadow-none"><CardContent className="p-6"><Coins aria-hidden="true" className="size-5 text-primary" /><p className="mt-5 text-sm text-muted-foreground">Credits remaining</p><p className="mt-1 text-4xl font-semibold tracking-[-0.06em] tabular-nums">{data.user.creditsRemaining}</p><p className="mt-3 text-xs leading-5 text-muted-foreground">{data.user.creditsUsedThisPeriod} credits used in the current period.</p></CardContent></Card>
          <Card className="border-border/80 bg-card/70 shadow-none"><CardContent className="flex gap-4 p-6"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground"><ReceiptText aria-hidden="true" className="size-4" /></span><div><p className="text-sm font-semibold">Credit accounting</p><p className="mt-2 text-xs leading-5 text-muted-foreground">The usage ledger records allocations, processing debits, refunds, and manual adjustments.</p></div></CardContent></Card>
          <div className="flex items-start gap-3 px-1 text-xs leading-5 text-muted-foreground"><ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" /><p>One credit covers one minute of source video. Processing rounds up to the next full minute.</p></div>
        </div>
      </div>
    </div>
  );
}
