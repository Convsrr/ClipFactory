import type { Metadata } from "next";
import Link from "next/link";
import { Check, Clock3, CreditCard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Start free, then add more processing credits when ClipFactory fits your workflow.",
};

const plans = [
  {
    name: "Free",
    price: "£0",
    cadence: "to start",
    description: "Try the full clipping workflow on your own source video.",
    features: ["60 processing credits", "Up to 5 clip candidates", "Three caption presets", "1080 × 1920 exports"],
    cta: "Start free",
    href: "/sign-up",
    featured: false,
  },
  {
    name: "Creator",
    price: "£19",
    cadence: "per month",
    description: "For a weekly podcast, interview, or creator publishing schedule.",
    features: ["600 processing credits", "Up to 10 clip candidates", "Metadata regeneration", "Priority render queue"],
    cta: "Choose Creator",
    href: "/sign-up?plan=creator",
    featured: true,
  },
];

export default function PricingPage() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
      <div className="mx-auto max-w-2xl text-center"><p className="eyebrow">Pricing</p><h1 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">Start with one video. Keep the plan that fits your week.</h1><p className="mt-5 text-lg leading-8 text-muted-foreground">One processing credit covers one minute of source video. We round up to the next full minute.</p></div>

      <div className="mx-auto mt-12 grid max-w-4xl gap-4 md:grid-cols-2">
        {plans.map((plan) => (
          <Card key={plan.name} className={plan.featured ? "border-primary/60 bg-card/80 shadow-soft ring-1 ring-primary/20" : "border-border/80 bg-card/65 shadow-none"}>
            <CardHeader className="p-6 pb-4 sm:p-7 sm:pb-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-muted-foreground">{plan.featured ? "For a regular publishing rhythm" : "For trying the workflow"}</p><CardTitle className="mt-2 text-xl">{plan.name}</CardTitle></div>{plan.featured ? <Badge>Most useful</Badge> : <Badge variant="outline">No card</Badge>}</div><div className="mt-6 flex items-end gap-2"><span className="text-4xl font-semibold tracking-[-0.06em]">{plan.price}</span><span className="pb-1 text-sm text-muted-foreground">{plan.cadence}</span></div><p className="mt-3 text-sm leading-6 text-muted-foreground">{plan.description}</p></CardHeader>
            <CardContent className="p-6 pt-2 sm:p-7 sm:pt-2"><ul className="space-y-3 text-sm">{plan.features.map((feature) => <li key={feature} className="flex items-start gap-3"><Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" /><span>{feature}</span></li>)}</ul></CardContent>
            <CardFooter className="p-6 pt-2 sm:p-7 sm:pt-2"><Button asChild variant={plan.featured ? "default" : "outline"} className="min-h-12 w-full rounded-xl text-base"><Link href={plan.href}>{plan.cta}</Link></Button></CardFooter>
          </Card>
        ))}
      </div>

      <div className="mx-auto mt-12 grid max-w-4xl gap-3 border-t border-border/70 pt-6 text-sm text-muted-foreground sm:grid-cols-3">
        <div className="flex gap-3"><Clock3 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" /><p>Credits reset each billing period.</p></div>
        <div className="flex gap-3"><CreditCard aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" /><p>Creator checkout runs through Stripe.</p></div>
        <p className="sm:text-right">The live price comes from <code className="font-mono text-xs text-foreground">STRIPE_PRICE_CREATOR_MONTHLY</code>.</p>
      </div>
    </section>
  );
}
