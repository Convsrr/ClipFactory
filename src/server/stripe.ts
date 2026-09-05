import "server-only";

import Stripe from "stripe";

export function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key, { apiVersion: "2026-08-26.dahlia", appInfo: { name: "ClipFactory", version: "0.1.0" } });
}

export function appUrl() {
  const value = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!value) throw new Error("NEXT_PUBLIC_APP_URL is not configured");
  const url = new URL(value);
  if (!new Set(["http:", "https:"]).has(url.protocol)) throw new Error("NEXT_PUBLIC_APP_URL must use HTTP or HTTPS");
  return url.origin;
}
