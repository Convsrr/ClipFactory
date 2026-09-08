import Link from "next/link";
import { Check, ShieldCheck } from "lucide-react";
import { LiveAuthForm, PreviewAuthForm } from "@/components/auth-form";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type AuthMode = "sign-in" | "sign-up";

export function AuthPage({ mode, configured }: { mode: AuthMode; configured: boolean }) {
  const isSignUp = mode === "sign-up";

  return (
    <div className="mx-auto grid min-h-[calc(100vh-9rem)] max-w-6xl items-center gap-12 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_0.82fr] lg:px-8 lg:py-16">
      <div className="hidden max-w-xl lg:block">
        <BrandMark />
        <p className="eyebrow mt-16">A calmer way to clip</p>
        <h1 className="mt-4 text-balance text-5xl font-semibold leading-[1.02] tracking-[-0.065em]">Make the short. Keep the judgement.</h1>
        <p className="mt-6 max-w-lg text-lg leading-8 text-muted-foreground">ClipFactory handles the search, framing, captions, and render queue. You decide what deserves to leave the edit.</p>
        <ul className="mt-9 space-y-4 text-sm">
          {["Ranked moments from your source video", "Speaker-aware vertical framing", "Readable caption presets and MP4 exports"].map((item) => <li key={item} className="flex items-center gap-3"><span className="grid size-6 place-items-center rounded-full bg-accent text-accent-foreground"><Check aria-hidden="true" className="size-3.5" /></span>{item}</li>)}
        </ul>
        <div className="mt-12 flex items-start gap-3 border-t border-border/70 pt-5 text-xs leading-5 text-muted-foreground"><ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" /><p>Your source stays in the connected workspace. AI output stays reviewable.</p></div>
      </div>

      <Card className="w-full border-border/80 bg-card/75 shadow-soft">
        <CardHeader className="p-6 pb-4 sm:p-8 sm:pb-4"><div className="mb-5 lg:hidden"><BrandMark /></div><CardTitle className="text-2xl tracking-[-0.04em]">{isSignUp ? "Create your workspace" : "Welcome back"}</CardTitle><CardDescription>{isSignUp ? "Start with 60 processing credits. No card required." : "Continue reviewing and exporting your clips."}</CardDescription></CardHeader>
        <CardContent className="p-6 pt-3 sm:p-8 sm:pt-3">{configured ? <LiveAuthForm mode={mode} /> : <PreviewAuthForm mode={mode} />}<p className="mt-6 text-center text-sm text-muted-foreground">{isSignUp ? "Already have an account?" : "New to ClipFactory?"}{" "}<Link href={isSignUp ? "/sign-in" : "/sign-up"} className="font-medium text-foreground underline decoration-primary underline-offset-4">{isSignUp ? "Sign in" : "Create an account"}</Link></p><Button asChild variant="ghost" className="mt-4 min-h-11 w-full text-muted-foreground"><Link href="/">Back to ClipFactory</Link></Button></CardContent>
      </Card>
    </div>
  );
}
