"use client";

// Bunny Stream iframe embed.
// externalVideoId must be stored as "{libraryId}/{videoId}" (slash-separated).
// Progress tracking via Bunny's postMessage API is deferred until the SDK
// is integrated. Manual completion is available through VideoLoader.

import type { VideoPlayerProps } from "./video-types";

export function BunnyStreamPlayer({ videoId, title }: VideoPlayerProps) {
  // externalVideoId format: "libraryId/videoId"
  const src = `https://iframe.mediadelivery.net/embed/${videoId}?autoplay=false&preload=false`;

  return (
    <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
      <iframe
        src={src}
        className="w-full h-full"
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        title={title ?? "Bunny Stream video"}
      />
    </div>
  );
}
