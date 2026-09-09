import type { Metadata } from "next";
import { AuthPage } from "@/components/auth-page";
import { isBackendConfigured } from "@/lib/app-mode";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return <AuthPage mode="sign-in" configured={isBackendConfigured()} />;
}
