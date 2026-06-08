"use client";

import * as React from "react";
import { updateLessonProgressAction } from "@/modules/lessons/actions/lesson-progress.actions";
import type { VideoProgress, ProgressContext } from "./video-types";

const DEBOUNCE_MS = 5_000;

export interface ProgressState {
  percentage: number;
  status: string;
  isCompleted: boolean;
}

export function useVideoProgress(context: ProgressContext | undefined): {
  onProgress: (p: VideoProgress) => void;
  onEnded: (p: VideoProgress) => Promise<void>;
  progressState: ProgressState;
} {
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = React.useRef<VideoProgress | null>(null);

  const [progressState, setProgressState] = React.useState<ProgressState>({
    percentage: context?.initialProgress?.progressPercentage ?? 0,
    status: context?.initialProgress?.status ?? "NOT_STARTED",
    isCompleted:
      (context?.initialProgress?.progressPercentage ?? 0) >=
      (context?.minWatchPercentage ?? 100),
  });

  const flush = React.useCallback(
    async (p: VideoProgress) => {
      if (!context) return;
      const percentage = Math.min(100, Math.round(p.percentage * 10) / 10);
      const res = await updateLessonProgressAction({
        lessonId: context.lessonId,
        subjectId: context.subjectId,
        enrollmentId: context.enrollmentId,
        watchedSeconds: Math.round(p.currentTime),
        progressPercentage: percentage,
      });
      if (res.success) {
        setProgressState({
          percentage,
          status: res.data.status,
          isCompleted: res.data.status === "COMPLETED",
        });
      }
    },
    [context]
  );

  const onProgress = React.useCallback(
    (p: VideoProgress) => {
      if (!context) return;
      pendingRef.current = p;
      if (timerRef.current) return;
      timerRef.current = setTimeout(async () => {
        timerRef.current = null;
        const pending = pendingRef.current;
        if (pending) {
          pendingRef.current = null;
          await flush(pending);
        }
      }, DEBOUNCE_MS);
    },
    [context, flush]
  );

  const onEnded = React.useCallback(
    async (p: VideoProgress) => {
      if (!context) return;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      pendingRef.current = null;
      await flush(p);
    },
    [context, flush]
  );

  React.useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return { onProgress, onEnded, progressState };
}
