import type { Metadata } from "next";
import { AuthPage } from "@/components/auth-page";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  const configured = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);
  return <AuthPage mode="sign-in" configured={configured} />;
}
