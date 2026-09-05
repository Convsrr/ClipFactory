import type { Metadata } from "next";
import { Check, Coins, ReceiptText } from "lucide-react";
import { BillingActions } from "@/components/billing-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadDashboard } from "@/server/app-data";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage() {
  const data = await loadDashboard();
  const isCreator = data.user.plan === "creator" || data.user.plan === "studio";
  return (
    <div className="space-y-7">
      <div><h1 className="text-3xl font-semibold tracking-[-0.04em]">Billing and usage</h1><p className="mt-2 text-sm text-muted-foreground">See your credit balance and manage the subscription through Stripe.</p></div>
      <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
        <Card className="border-primary bg-card shadow-soft ring-1 ring-primary/60"><CardHeader className="p-6 pb-3"><div className="flex items-center justify-between gap-3"><CardTitle className="text-lg capitalize">{data.user.plan} plan</CardTitle><Badge>{isCreator ? "Active" : "Current plan"}</Badge></div></CardHeader><CardContent className="p-6 pt-3"><div className="flex items-end gap-2"><span className="text-4xl font-semibold tracking-[-0.05em]">{isCreator ? "£19" : "£0"}</span><span className="pb-1 text-sm text-muted-foreground">{isCreator ? "per month" : "to start"}</span></div><ul className="mt-6 space-y-3 text-sm">{[isCreator ? "600 processing credits" : "60 processing credits", "1080 × 1920 exports", "Three caption presets"].map((item) => <li key={item} className="flex gap-2"><Check aria-hidden="true" className="size-4 text-primary" />{item}</li>)}</ul><div className="mt-7"><BillingActions previewMode={data.mode === "preview"} hasSubscription={isCreator} /></div>{data.mode === "preview" ? <p className="mt-3 text-xs text-muted-foreground">Billing actions stay disabled in the sample workspace.</p> : null}</CardContent></Card>
        <div className="space-y-5"><Card className="border-foreground/12 bg-card/85 shadow-none"><CardContent className="p-5"><Coins aria-hidden="true" className="size-5 text-primary" /><p className="mt-5 text-sm text-muted-foreground">Credits remaining</p><p className="mt-1 text-4xl font-semibold tracking-[-0.05em] tabular-nums">{data.user.creditsRemaining}</p><p className="mt-3 text-xs leading-5 text-muted-foreground">{data.user.creditsUsedThisPeriod} credits used in the current period.</p></CardContent></Card><Card className="border-foreground/12 bg-card/85 shadow-none"><CardContent className="p-5"><ReceiptText aria-hidden="true" className="size-5 text-primary" /><p className="mt-5 text-sm font-semibold">Credit accounting</p><p className="mt-2 text-xs leading-5 text-muted-foreground">The usage ledger records allocations, processing debits, refunds, and manual adjustments. It never includes sample workspace activity.</p></CardContent></Card></div>
      </div>
    </div>
  );
}
