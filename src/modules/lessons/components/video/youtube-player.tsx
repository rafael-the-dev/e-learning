"use client";

import * as React from "react";
import type { VideoPlayerProps } from "./video-types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const window: any;

const POLL_MS = 5_000;

export function YouTubePlayer({ videoId, startAt = 0, onProgress, onEnded, onError }: VideoPlayerProps) {
  const domId = React.useRef(`yt-${Math.random().toString(36).slice(2)}`).current;
  const playerRef = React.useRef<any>(null);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    function buildPlayer() {
      playerRef.current = new window.YT.Player(domId, {
        videoId,
        playerVars: {
          start: Math.floor(startAt),
          autoplay: 0,
          modestbranding: 1,
          rel: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: () => setReady(true),
          onStateChange: (e: any) => {
            const { PLAYING, PAUSED, ENDED } = window.YT.PlayerState;
            if (e.data === PLAYING) {
              pollRef.current = setInterval(() => {
                const current: number = playerRef.current?.getCurrentTime?.() ?? 0;
                const duration: number = playerRef.current?.getDuration?.() ?? 0;
                if (duration > 0) onProgress?.({ currentTime: current, duration, percentage: (current / duration) * 100 });
              }, POLL_MS);
            } else {
              if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
              const current: number = playerRef.current?.getCurrentTime?.() ?? 0;
              const duration: number = playerRef.current?.getDuration?.() ?? 0;
              if (duration > 0) {
                if (e.data === ENDED) {
                  onProgress?.({ currentTime: duration, duration, percentage: 100 });
                  onEnded?.({ currentTime: duration, duration, percentage: 100 });
                } else if (e.data === PAUSED) {
                  onProgress?.({ currentTime: current, duration, percentage: (current / duration) * 100 });
                }
              }
            }
          },
          onError: () => onError?.("Erro ao carregar o vídeo do YouTube"),
        },
      });
    }

    if (window.YT?.Player) {
      buildPlayer();
    } else {
      if (!document.getElementById("yt-api")) {
        const s = document.createElement("script");
        s.id = "yt-api";
        s.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(s);
      }
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { prev?.(); buildPlayer(); };
    }

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      playerRef.current?.destroy?.();
    };
    // videoId is intentionally the only dep — rebuild only on video change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  return (
    <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
      <div id={domId} className="w-full h-full" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <div className="size-9 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
