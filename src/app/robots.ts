import type { MetadataRoute } from "next";
import { resolveSiteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = resolveSiteUrl();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app/", "/api/"] }],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
