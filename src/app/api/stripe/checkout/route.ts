import { randomBytes } from "node:crypto";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import { appUrl, stripeClient } from "@/server/stripe";

export async function POST() {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) return Response.json({ error: "Billing is disabled in preview mode." }, { status: 503 });
  const token = await convexAuthNextjsToken();
  if (!token) return Response.json({ error: "Sign in before changing your plan." }, { status: 401 });
  const price = process.env.STRIPE_PRICE_CREATOR_MONTHLY?.trim();
  if (!price) return Response.json({ error: "STRIPE_PRICE_CREATOR_MONTHLY is not configured." }, { status: 503 });
  try {
    const stripe = stripeClient();
    const user = await fetchQuery(api.users.current, {}, { token });
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, name: user.name, metadata: { convexUserId: user.id } });
      customerId = customer.id;
      await fetchMutation(api.users.setStripeCustomer, { stripeCustomerId: customerId }, { token });
    }
    const suffix = randomBytes(6).toString("base64url").replace(/[^a-zA-Z]/g, "").slice(0, 8).padEnd(8, "x");
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      integration_identifier: `clipfactory_${suffix}`,
      line_items: [{ price, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${appUrl()}/app/billing?checkout=success`,
      cancel_url: `${appUrl()}/app/billing?checkout=cancelled`,
      metadata: { convexUserId: user.id, plan: "creator" },
    });
    if (!session.url) throw new Error("Stripe did not return a Checkout URL");
    return Response.json({ url: session.url });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not start Stripe Checkout." }, { status: 502 });
  }
}
