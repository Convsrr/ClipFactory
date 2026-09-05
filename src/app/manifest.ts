import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ClipFactory",
    short_name: "ClipFactory",
    description: "Create focused vertical clips from long-form video.",
    start_url: "/app/dashboard",
    display: "standalone",
    background_color: "#f6f4ef",
    theme_color: "#5f4bd8",
  };
}
