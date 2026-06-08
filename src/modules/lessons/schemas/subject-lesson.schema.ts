import { z } from "zod";

export const assignLessonToSubjectSchema = z.object({
  subjectId: z.string().min(1),
  lessonId: z.string().min(1),
  order: z.number().int().min(0).default(0),
  isRequired: z.boolean().default(false),
  minWatchPercentage: z
    .number()
    .int()
    .min(0, "Percentagem mínima não pode ser negativa")
    .max(100, "Percentagem mínima não pode exceder 100")
    .default(0),
  unlockAfterLessonId: z.string().optional().nullable(),
});

export type AssignLessonToSubjectSchema = z.infer<typeof assignLessonToSubjectSchema>;

export const updateSubjectLessonSchema = z.object({
  subjectLessonId: z.string().min(1),
  isRequired: z.boolean().optional(),
  minWatchPercentage: z
    .number()
    .int()
    .min(0, "Percentagem mínima não pode ser negativa")
    .max(100, "Percentagem mínima não pode exceder 100")
    .optional(),
  unlockAfterLessonId: z.string().optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
});

export type UpdateSubjectLessonSchema = z.infer<typeof updateSubjectLessonSchema>;

export const reorderSubjectLessonsSchema = z.object({
  subjectId: z.string().min(1),
  orderedIds: z.array(z.string().min(1)).min(1, "É necessário pelo menos uma lição"),
});

export type ReorderSubjectLessonsSchema = z.infer<typeof reorderSubjectLessonsSchema>;

export const updateLessonProgressSchema = z.object({
  lessonId: z.string().min(1),
  subjectId: z.string().min(1),
  enrollmentId: z.string().min(1),
  watchedSeconds: z.number().int().min(0).default(0),
  progressPercentage: z
    .number()
    .min(0, "Percentagem não pode ser negativa")
    .max(100, "Percentagem não pode exceder 100")
    .default(0),
});

export type UpdateLessonProgressSchema = z.infer<typeof updateLessonProgressSchema>;
