import type { Metadata, Viewport } from "next";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { AppProviders } from "@/components/app-providers";
import { resolveSiteUrl } from "@/lib/site-url";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(resolveSiteUrl()),
  title: {
    default: "ClipFactory — Turn long videos into strong short clips",
    template: "%s | ClipFactory",
  },
  description:
    "Find the strongest moments in a long video, reframe them for vertical feeds, add captions, and export ready-to-post clips.",
  applicationName: "ClipFactory",
  openGraph: {
    title: "ClipFactory",
    description: "Turn one long video into short clips worth publishing.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ClipFactory",
    description: "Turn one long video into short clips worth publishing.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f6f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0e12" },
  ],
};

function BackendProvider({ children }: { children: React.ReactNode }) {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) return children;
  return <ConvexAuthNextjsServerProvider>{children}</ConvexAuthNextjsServerProvider>;
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
    >
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <BackendProvider>
          <AppProviders>{children}</AppProviders>
        </BackendProvider>
      </body>
    </html>
  );
}
