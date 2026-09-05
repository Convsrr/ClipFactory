"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function BillingActions({ previewMode, hasSubscription }: { previewMode: boolean; hasSubscription: boolean }) {
  const [pending, setPending] = useState(false);
  async function openBilling(target: "checkout" | "portal") {
    setPending(true);
    try {
      const response = await fetch(`/api/stripe/${target}`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Billing is unavailable.");
      window.location.assign(result.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Billing is unavailable.");
      setPending(false);
    }
  }
  return (
    <Button className="min-h-12 w-full rounded-xl sm:w-auto" disabled={previewMode || pending} onClick={() => openBilling(hasSubscription ? "portal" : "checkout")}>
      {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}{hasSubscription ? "Manage subscription" : "Upgrade to Creator"}
    </Button>
  );
}
