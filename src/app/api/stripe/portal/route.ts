import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import { appUrl, stripeClient } from "@/server/stripe";

export async function POST() {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) return Response.json({ error: "Billing is disabled in preview mode." }, { status: 503 });
  const token = await convexAuthNextjsToken();
  if (!token) return Response.json({ error: "Sign in before managing billing." }, { status: 401 });
  try {
    const user = await fetchQuery(api.users.current, {}, { token });
    if (!user.stripeCustomerId) return Response.json({ error: "No Stripe customer is linked to this account." }, { status: 404 });
    const session = await stripeClient().billingPortal.sessions.create({ customer: user.stripeCustomerId, return_url: `${appUrl()}/app/billing` });
    return Response.json({ url: session.url });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not open the billing portal." }, { status: 502 });
  }
}
