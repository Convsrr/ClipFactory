import type { Metadata } from "next";
import { AuthPage } from "@/components/auth-page";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  const configured = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);
  return <AuthPage mode="sign-up" configured={configured} />;
}
