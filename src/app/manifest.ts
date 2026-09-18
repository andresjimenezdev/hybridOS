import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HybridOS",
    short_name: "HybridOS",
    description: "Sistema personal de salud, entrenamiento y rendimiento.",
    start_url: "/hoy",
    display: "standalone",
    background_color: "#f5f5f2",
    theme_color: "#f5f5f2",
    orientation: "portrait-primary",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
