import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Racio — Gestão Escolar",
    short_name: "Racio",
    description:
      "Plataforma de gestão para escolas de condução e centros de formação.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#171717",
    icons: [
      {
        src: "/images/favicon/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/images/favicon/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/images/favicon/icon-1024.png",
        sizes: "1024x1024",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
