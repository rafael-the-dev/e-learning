// Shared types for the video player subsystem.

export interface VideoProgress {
  currentTime: number;  // seconds watched
  duration: number;     // total seconds
  percentage: number;   // 0–100
}

export interface VideoPlayerProps {
  videoId: string;      // externalVideoId or videoUrl (S3/External)
  title?: string;
  startAt?: number;     // resume position in seconds
  onProgress?: (progress: VideoProgress) => void;
  onEnded?: (progress: VideoProgress) => void;
  onError?: (message: string) => void;
}

// Provided by the page when a student is watching with a known enrollment.
// Without this, VideoLoader renders in preview mode (no progress tracking).
export interface ProgressContext {
  lessonId: string;
  subjectId: string;
  enrollmentId: string;
  minWatchPercentage: number;
  initialProgress?: {
    watchedSeconds: number;
    progressPercentage: number;
    status: string;
  };
}
