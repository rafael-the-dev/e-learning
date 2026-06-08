import { z } from "zod";

export const createLessonSchema = z.object({
  title: z.string().min(2, "O título deve ter pelo menos 2 caracteres"),
  slug: z
    .string()
    .min(2, "O slug deve ter pelo menos 2 caracteres")
    .regex(/^[a-z0-9-]+$/, "O slug só pode conter letras minúsculas, números e hífens"),
  description: z.string().optional().nullable(),
  summary: z.string().optional().nullable(),
  objectives: z.string().optional().nullable(),
  durationMinutes: z.number().int().min(1).optional().nullable(),
  lessonType: z.enum(["VIDEO", "TEXT", "LIVE", "PRACTICAL", "READING", "ASSIGNMENT_PREP"]),
  videoProvider: z
    .enum(["YOUTUBE", "VIMEO", "CLOUDFLARE_STREAM", "BUNNY", "S3", "EXTERNAL", "NONE"])
    .default("NONE"),
  videoUrl: z.string().url("URL inválida").optional().nullable(),
  externalVideoId: z.string().optional().nullable(),
  thumbnailUrl: z.string().url("URL inválida").optional().nullable(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).default("DRAFT"),
});

export type CreateLessonSchema = z.infer<typeof createLessonSchema>;

export const updateLessonSchema = z.object({
  lessonId: z.string().min(1),
  title: z.string().min(2, "O título deve ter pelo menos 2 caracteres").optional(),
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, "O slug só pode conter letras minúsculas, números e hífens")
    .optional(),
  description: z.string().optional().nullable(),
  summary: z.string().optional().nullable(),
  objectives: z.string().optional().nullable(),
  durationMinutes: z.number().int().min(1).optional().nullable(),
  lessonType: z
    .enum(["VIDEO", "TEXT", "LIVE", "PRACTICAL", "READING", "ASSIGNMENT_PREP"])
    .optional(),
  videoProvider: z
    .enum(["YOUTUBE", "VIMEO", "CLOUDFLARE_STREAM", "BUNNY", "S3", "EXTERNAL", "NONE"])
    .optional(),
  videoUrl: z.string().url("URL inválida").optional().nullable(),
  externalVideoId: z.string().optional().nullable(),
  thumbnailUrl: z.string().url("URL inválida").optional().nullable(),
});

export type UpdateLessonSchema = z.infer<typeof updateLessonSchema>;
