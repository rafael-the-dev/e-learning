"use client";

import * as React from "react";
import type { VideoPlayerProps } from "./video-types";

interface ExternalVideoPlayerProps extends VideoPlayerProps {
  // "s3" renders a native <video> element with full event tracking.
  // "external" renders a sandboxed <iframe> (progress not trackable).
  mode: "s3" | "external";
}

export function ExternalVideoPlayer({
  videoId,
  title,
  startAt = 0,
  onProgress,
  onEnded,
  onError,
  mode,
}: ExternalVideoPlayerProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null);

  // Restore playback position for native video on mount.
  React.useEffect(() => {
    if (mode === "s3" && videoRef.current && startAt > 0) {
      videoRef.current.currentTime = startAt;
    }
  }, [mode, startAt]);

  if (mode === "s3") {
    return (
      <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
        <video
          ref={videoRef}
          src={videoId}
          controls
          className="w-full h-full"
          title={title}
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            if (el.duration > 0) {
              onProgress?.({
                currentTime: el.currentTime,
                duration: el.duration,
                percentage: (el.currentTime / el.duration) * 100,
              });
            }
          }}
          onEnded={(e) => {
            const el = e.currentTarget;
            onProgress?.({ currentTime: el.duration, duration: el.duration, percentage: 100 });
            onEnded?.({ currentTime: el.duration, duration: el.duration, percentage: 100 });
          }}
          onError={() => onError?.("Erro ao carregar o vídeo")}
        />
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
      <iframe
        src={videoId}
        className="w-full h-full"
        allow="autoplay; fullscreen"
        allowFullScreen
        sandbox="allow-scripts allow-same-origin allow-presentation allow-forms"
        title={title ?? "Vídeo externo"}
      />
    </div>
  );
}
