"use client";

import * as React from "react";
import type { VideoPlayerProps } from "./video-types";

// Uses Vimeo's postMessage API — no external SDK required.
// Docs: https://developer.vimeo.com/player/sdk/basics

export function VimeoPlayer({ videoId, startAt = 0, onProgress, onEnded, onError }: VideoPlayerProps) {
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const playerId = React.useRef(`vimeo-${Math.random().toString(36).slice(2)}`).current;
  const durationRef = React.useRef<number>(0);
  const [ready, setReady] = React.useState(false);

  function post(method: string, value?: unknown) {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ method, value, player_id: playerId }),
      "https://player.vimeo.com"
    );
  }

  React.useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== "https://player.vimeo.com") return;
      let data: Record<string, unknown>;
      try { data = typeof e.data === "string" ? JSON.parse(e.data) : e.data; }
      catch { return; }

      if (data.player_id !== playerId) return;

      if (data.event === "ready") {
        setReady(true);
        post("addEventListener", "playProgress");
        post("addEventListener", "finish");
        post("addEventListener", "error");
        if (startAt > 0) post("seekTo", startAt);
      }

      if (data.event === "playProgress") {
        const d = data.data as { seconds: number; percent: number; duration: number };
        durationRef.current = d.duration;
        onProgress?.({ currentTime: d.seconds, duration: d.duration, percentage: d.percent * 100 });
      }

      if (data.event === "finish") {
        const dur = durationRef.current;
        onProgress?.({ currentTime: dur, duration: dur, percentage: 100 });
        onEnded?.({ currentTime: dur, duration: dur, percentage: 100 });
      }

      if (data.event === "error") {
        onError?.("Erro ao carregar o vídeo do Vimeo");
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [videoId, playerId]);

  const src = `https://player.vimeo.com/video/${videoId}?api=1&player_id=${playerId}&autopause=0`;

  return (
    <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
      <iframe
        ref={iframeRef}
        src={src}
        className="w-full h-full"
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        title="Vimeo video"
      />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-black pointer-events-none">
          <div className="size-9 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
