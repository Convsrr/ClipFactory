import { convexAuthNextjsMiddleware, createRouteMatcher, nextjsMiddlewareRedirect } from "@convex-dev/auth/nextjs/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isBackendConfigured, isLocalAuthDisabled } from "@/lib/app-mode";

const isProtectedRoute = createRouteMatcher(["/app(.*)", "/api/projects(.*)", "/api/uploads(.*)", "/api/clips(.*)", "/api/stripe/checkout", "/api/stripe/portal"]);
const isAuthRoute = createRouteMatcher(["/sign-in", "/sign-up"]);

const authProxy = convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  if (isProtectedRoute(request) && !(await convexAuth.isAuthenticated())) return nextjsMiddlewareRedirect(request, "/sign-in");
  return NextResponse.next();
});

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (isLocalAuthDisabled() && isAuthRoute(request)) return nextjsMiddlewareRedirect(request, "/app/dashboard");
  if (!isBackendConfigured()) return NextResponse.next();
  return authProxy(request, event);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
