"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AuthMode = "sign-in" | "sign-up";

export function LiveAuthForm({ mode }: { mode: AuthMode }) {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    formData.set("flow", mode === "sign-up" ? "signUp" : "signIn");

    try {
      await signIn("password", formData);
      toast.success(mode === "sign-up" ? "Your workspace is ready" : "Welcome back");
      router.push("/app/dashboard");
    } catch {
      setError(
        mode === "sign-up"
          ? "We could not create that account. Check the details and try again."
          : "Email or password did not match. Try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return <AuthFields mode={mode} pending={pending} error={error} onSubmit={handleSubmit} />;
}

export function PreviewAuthForm({ mode }: { mode: AuthMode }) {
  return (
    <div className="space-y-5">
      <Alert className="border-primary/30 bg-primary/10">
        <AlertTitle>Preview mode</AlertTitle>
        <AlertDescription>Convex Auth is not configured locally. Explore the sample workspace without creating an account.</AlertDescription>
      </Alert>
      <AuthFields mode={mode} pending={false} error={null} onSubmit={(event) => event.preventDefault()} disabled />
      <Button asChild className="min-h-12 w-full rounded-xl text-base">
        <Link href="/app/dashboard">Open preview workspace <ArrowRight aria-hidden="true" /></Link>
      </Button>
    </div>
  );
}

function AuthFields({
  mode,
  pending,
  error,
  onSubmit,
  disabled = false,
}: {
  mode: AuthMode;
  pending: boolean;
  error: string | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  disabled?: boolean;
}) {
  return (
    <form className="space-y-5" onSubmit={onSubmit} aria-busy={pending}>
      {mode === "sign-up" ? (
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" autoComplete="name" placeholder="Alex Morgan" required disabled={disabled} className="h-12" />
        </div>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" inputMode="email" autoComplete="email" placeholder="you@company.com" required disabled={disabled} className="h-12" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete={mode === "sign-up" ? "new-password" : "current-password"} minLength={8} required disabled={disabled} className="h-12" aria-describedby={mode === "sign-up" ? "password-hint" : undefined} />
        {mode === "sign-up" ? <p id="password-hint" className="text-xs leading-5 text-muted-foreground">Use at least eight characters.</p> : null}
      </div>
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {!disabled ? (
        <Button type="submit" className="min-h-12 w-full rounded-xl text-base" disabled={pending} aria-busy={pending}>
          {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
          {mode === "sign-up" ? "Create account" : "Sign in"}
        </Button>
      ) : null}
    </form>
  );
}
