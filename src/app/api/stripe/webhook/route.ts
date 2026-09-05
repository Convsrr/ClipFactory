import { fetchMutation } from "convex/nextjs";
import type Stripe from "stripe";
import { api } from "../../../../../convex/_generated/api";
import { stripeClient } from "@/server/stripe";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const forwardingSecret = process.env.STRIPE_WEBHOOK_FORWARDING_SECRET;
  if (!signature || !webhookSecret || !forwardingSecret || !process.env.NEXT_PUBLIC_CONVEX_URL) return Response.json({ error: "Stripe webhook is not configured." }, { status: 503 });
  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(await request.text(), signature, webhookSecret);
  } catch {
    return Response.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }
  const subscription = subscriptionFromEvent(event);
  if (subscription) {
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
    const active = subscription.status === "active" || subscription.status === "trialing";
    await fetchMutation(api.billing.syncSubscription, { forwardingSecret, stripeCustomerId: customerId, stripeSubscriptionId: subscription.id, subscriptionStatus: subscription.status, plan: active ? "creator" : "free" });
  }
  return Response.json({ received: true });
}

function subscriptionFromEvent(event: Stripe.Event) {
  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") return event.data.object;
  return null;
}
