import type { Metadata } from "next";
import Link from "next/link";
import { LiveAuthForm, PreviewAuthForm } from "@/components/auth-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  const configured = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);
  return (
    <div className="mx-auto grid min-h-[calc(100vh-8rem)] max-w-7xl place-items-center px-4 py-12 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md border-foreground/15 bg-card/90 shadow-soft">
        <CardHeader className="space-y-2 p-6 pb-4 sm:p-8 sm:pb-4">
          <CardTitle className="text-2xl tracking-[-0.03em]">Sign in to your workspace</CardTitle>
          <CardDescription>Continue reviewing and exporting your clips.</CardDescription>
        </CardHeader>
        <CardContent className="p-6 pt-3 sm:p-8 sm:pt-3">
          {configured ? <LiveAuthForm mode="sign-in" /> : <PreviewAuthForm mode="sign-in" />}
          <p className="mt-6 text-center text-sm text-muted-foreground">
            New to ClipFactory? <Link href="/sign-up" className="font-medium text-foreground underline underline-offset-4">Create an account</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
