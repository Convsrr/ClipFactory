import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
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
    description: "Test the full clipping workflow on your own source video.",
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
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <Badge variant="outline" className="bg-card">Simple credit plans</Badge>
        <h1 className="mt-5 text-balance text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">Start with one video. Pay when the workflow earns a place in your week.</h1>
        <p className="mt-5 text-lg leading-8 text-muted-foreground">One processing credit covers one minute of source video. We round up to the next full minute.</p>
      </div>
      <div className="mx-auto mt-12 grid max-w-4xl gap-5 md:grid-cols-2">
        {plans.map((plan) => (
          <Card key={plan.name} className={plan.featured ? "border-primary bg-card shadow-soft ring-1 ring-primary" : "border-foreground/15 bg-card/80 shadow-none"}>
            <CardHeader className="p-6 pb-4 sm:p-8 sm:pb-4">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-lg">{plan.name}</CardTitle>
                {plan.featured ? <Badge>Most useful</Badge> : null}
              </div>
              <div className="mt-5 flex items-end gap-2">
                <span className="text-4xl font-semibold tracking-[-0.05em]">{plan.price}</span>
                <span className="pb-1 text-sm text-muted-foreground">{plan.cadence}</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{plan.description}</p>
            </CardHeader>
            <CardContent className="p-6 pt-2 sm:p-8 sm:pt-2">
              <ul className="space-y-3 text-sm">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-3"><Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" /><span>{feature}</span></li>
                ))}
              </ul>
            </CardContent>
            <CardFooter className="p-6 pt-2 sm:p-8 sm:pt-2">
              <Button asChild variant={plan.featured ? "default" : "outline"} className="min-h-12 w-full rounded-xl text-base">
                <Link href={plan.href}>{plan.cta}</Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
      <p className="mx-auto mt-8 max-w-2xl text-center text-sm leading-6 text-muted-foreground">
        Creator pricing is an MVP product decision. The live Checkout price comes from <code className="font-mono text-xs text-foreground">STRIPE_PRICE_CREATOR_MONTHLY</code>.
      </p>
    </section>
  );
}
