// =============================================================================
// LESSONS MODULE — TYPES
// =============================================================================

export const LESSON_TYPE = {
  VIDEO: "VIDEO",
  TEXT: "TEXT",
  LIVE: "LIVE",
  PRACTICAL: "PRACTICAL",
  READING: "READING",
  ASSIGNMENT_PREP: "ASSIGNMENT_PREP",
} as const;

export type LessonType = (typeof LESSON_TYPE)[keyof typeof LESSON_TYPE];

export const LESSON_TYPE_LABELS: Record<string, string> = {
  VIDEO: "Vídeo",
  TEXT: "Texto",
  LIVE: "Ao Vivo",
  PRACTICAL: "Prática",
  READING: "Leitura",
  ASSIGNMENT_PREP: "Preparação de Tarefa",
};

export const VIDEO_PROVIDER = {
  YOUTUBE: "YOUTUBE",
  VIMEO: "VIMEO",
  CLOUDFLARE_STREAM: "CLOUDFLARE_STREAM",
  BUNNY: "BUNNY",
  S3: "S3",
  EXTERNAL: "EXTERNAL",
  NONE: "NONE",
} as const;

export type VideoProvider = (typeof VIDEO_PROVIDER)[keyof typeof VIDEO_PROVIDER];

export const VIDEO_PROVIDER_LABELS: Record<string, string> = {
  YOUTUBE: "YouTube",
  VIMEO: "Vimeo",
  CLOUDFLARE_STREAM: "Cloudflare Stream",
  BUNNY: "Bunny CDN",
  S3: "Amazon S3",
  EXTERNAL: "Externo",
  NONE: "Sem Vídeo",
};

export const LESSON_STATUS = {
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
  ARCHIVED: "ARCHIVED",
} as const;

export type LessonStatus = (typeof LESSON_STATUS)[keyof typeof LESSON_STATUS];

export const LESSON_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  PUBLISHED: "Publicada",
  ARCHIVED: "Arquivada",
};

export const FILE_TYPE = {
  PDF: "PDF",
  IMAGE: "IMAGE",
  DOCUMENT: "DOCUMENT",
  SPREADSHEET: "SPREADSHEET",
  PRESENTATION: "PRESENTATION",
  AUDIO: "AUDIO",
  VIDEO: "VIDEO",
  OTHER: "OTHER",
} as const;

export type FileType = (typeof FILE_TYPE)[keyof typeof FILE_TYPE];

export const FILE_TYPE_LABELS: Record<string, string> = {
  PDF: "PDF",
  IMAGE: "Imagem",
  DOCUMENT: "Documento",
  SPREADSHEET: "Folha de Cálculo",
  PRESENTATION: "Apresentação",
  AUDIO: "Áudio",
  VIDEO: "Vídeo",
  OTHER: "Outro",
};

export const SUBJECT_LESSON_STATUS = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  ARCHIVED: "ARCHIVED",
} as const;

export type SubjectLessonStatus =
  (typeof SUBJECT_LESSON_STATUS)[keyof typeof SUBJECT_LESSON_STATUS];

export const SUBJECT_LESSON_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
  ARCHIVED: "Arquivado",
};

export const PROGRESS_STATUS = {
  NOT_STARTED: "NOT_STARTED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
} as const;

export type ProgressStatus = (typeof PROGRESS_STATUS)[keyof typeof PROGRESS_STATUS];

export const PROGRESS_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "Não Iniciado",
  IN_PROGRESS: "Em Progresso",
  COMPLETED: "Concluído",
};

// =============================================================================
// DOMAIN INTERFACES
// =============================================================================

export interface Lesson {
  id: string;
  organizationId: string;
  title: string;
  slug: string;
  description: string | null;
  summary: string | null;
  objectives: string | null;
  durationMinutes: number | null;
  lessonType: string;
  videoProvider: string;
  videoUrl: string | null;
  externalVideoId: string | null;
  thumbnailUrl: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  attachmentsCount?: number;
  subjectsCount?: number;
}

export interface LessonAttachment {
  id: string;
  organizationId: string;
  lessonId: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number | null;
  isDownloadable: boolean;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface SubjectLesson {
  id: string;
  organizationId: string;
  subjectId: string;
  lessonId: string;
  order: number;
  isRequired: boolean;
  minWatchPercentage: number;
  unlockAfterLessonId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  lesson?: Pick<Lesson, "id" | "title" | "slug" | "lessonType" | "durationMinutes" | "status" | "videoProvider">;
}

export interface StudentLessonProgress {
  id: string;
  organizationId: string;
  studentId: string;
  enrollmentId: string;
  subjectId: string;
  lessonId: string;
  subjectLessonId: string | null;
  watchedSeconds: number;
  progressPercentage: number;
  status: string;
  completedAt: Date | null;
  lastAccessedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
