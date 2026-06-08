"use client";

import * as React from "react";
import { YouTubePlayer } from "./youtube-player";
import { VimeoPlayer } from "./vimeo-player";
import { CloudflareStreamPlayer } from "./cloudflare-stream-player";
import { BunnyStreamPlayer } from "./bunny-stream-player";
import { ExternalVideoPlayer } from "./external-video-player";
import { useVideoProgress } from "./use-video-progress";
import { Button } from "@/shared/components/ui/button";
import { CheckCircle2, AlertCircle } from "lucide-react";
import type { ProgressContext, VideoProgress } from "./video-types";

// Providers with full event-based progress tracking.
const TRACKABLE = new Set(["YOUTUBE", "VIMEO", "S3"]);

interface VideoData {
  videoProvider: string;
  videoUrl: string | null;
  externalVideoId: string | null;
  title: string;
}

interface VideoLoaderProps {
  video: VideoData;
  // undefined = preview mode (admin/teacher — no progress recorded)
  progressContext?: ProgressContext;
}

export function VideoLoader({ video, progressContext }: VideoLoaderProps) {
  const { videoProvider, videoUrl, externalVideoId, title } = video;
  const { onProgress, onEnded, progressState } = useVideoProgress(progressContext);

  const [manualCompleting, setManualCompleting] = React.useState(false);

  const videoId = externalVideoId ?? videoUrl ?? "";
  const startAt = progressContext?.initialProgress?.watchedSeconds ?? 0;
  const isTrackable = TRACKABLE.has(videoProvider);
  const hasProgressContext = !!progressContext;

  // Handlers passed to players — only wire up when progress context exists.
  const handleProgress = hasProgressContext ? onProgress : undefined;

  async function handleEnded(p: VideoProgress) {
    if (hasProgressContext) await onEnded(p);
  }

  async function handleMarkComplete() {
    if (!progressContext) return;
    setManualCompleting(true);
    await onEnded({ currentTime: 0, duration: 0, percentage: 100 });
    setManualCompleting(false);
  }

  if (!videoId) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        <AlertCircle className="size-4 shrink-0" />
        Nenhum vídeo configurado para esta lição.
      </div>
    );
  }

  function renderPlayer() {
    switch (videoProvider) {
      case "YOUTUBE":
        return (
          <YouTubePlayer
            videoId={videoId}
            title={title}
            startAt={startAt}
            onProgress={handleProgress}
            onEnded={handleEnded}
          />
        );
      case "VIMEO":
        return (
          <VimeoPlayer
            videoId={videoId}
            title={title}
            startAt={startAt}
            onProgress={handleProgress}
            onEnded={handleEnded}
          />
        );
      case "CLOUDFLARE_STREAM":
        return <CloudflareStreamPlayer videoId={videoId} title={title} />;
      case "BUNNY":
        return <BunnyStreamPlayer videoId={videoId} title={title} />;
      case "S3":
        return (
          <ExternalVideoPlayer
            videoId={videoId}
            title={title}
            startAt={startAt}
            mode="s3"
            onProgress={handleProgress}
            onEnded={handleEnded}
          />
        );
      case "EXTERNAL":
        return <ExternalVideoPlayer videoId={videoId} title={title} mode="external" />;
      default:
        return (
          <div className="flex items-center gap-2 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            <AlertCircle className="size-4 shrink-0" />
            Fornecedor de vídeo não suportado: {videoProvider}
          </div>
        );
    }
  }

  const showManualComplete =
    hasProgressContext && !isTrackable && !progressState.isCompleted;

  const showCompletedBanner = hasProgressContext && progressState.isCompleted;

  return (
    <div className="space-y-3">
      {renderPlayer()}

      {/* Progress bar — only when tracking */}
      {hasProgressContext && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Progresso</span>
            <span>{Math.round(progressState.percentage)}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${progressState.percentage}%` }}
            />
          </div>
          {progressContext.minWatchPercentage > 0 && (
            <p className="text-xs text-muted-foreground">
              Mínimo para conclusão: {progressContext.minWatchPercentage}%
            </p>
          )}
        </div>
      )}

      {showCompletedBanner && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30 px-4 py-2.5 text-sm text-green-700 dark:text-green-400">
          <CheckCircle2 className="size-4 shrink-0" />
          Lição concluída
        </div>
      )}

      {showManualComplete && (
        <Button
          size="sm"
          variant="outline"
          onClick={handleMarkComplete}
          disabled={manualCompleting}
        >
          {manualCompleting ? "A registar…" : "Marcar como concluído"}
        </Button>
      )}

      {/* Preview mode badge for admin/teacher */}
      {!hasProgressContext && (
        <p className="text-xs text-muted-foreground">
          Modo de pré-visualização — o progresso não é registado.
        </p>
      )}
    </div>
  );
}
