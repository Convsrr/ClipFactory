"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function LiveSignOut() {
  const { signOut } = useAuthActions();
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      className="min-h-11 w-full justify-start"
      onClick={async () => {
        await signOut();
        router.push("/");
      }}
    >
      <LogOut aria-hidden="true" /> Sign out
    </Button>
  );
}
