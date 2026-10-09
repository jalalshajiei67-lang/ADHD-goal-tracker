import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PriorityPulse",
    short_name: "Pulse",
    description: "One goal at a time. It checks in, so you don't have to remember.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f5f0",
    theme_color: "#2f6f5e",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
