"use client";

// Cloudflare Stream iframe embed.
// Progress tracking via the Cloudflare Stream SDK is deferred until the
// SDK is integrated. For now the player embeds the iframe and exposes a
// manual "Marcar como concluído" action through the VideoLoader wrapper.

import type { VideoPlayerProps } from "./video-types";

export function CloudflareStreamPlayer({ videoId, title }: VideoPlayerProps) {
  const src = `https://iframe.cloudflarestream.com/${videoId}?preload=true`;

  return (
    <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
      <iframe
        src={src}
        className="w-full h-full"
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        title={title ?? "Cloudflare Stream video"}
      />
    </div>
  );
}
