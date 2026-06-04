import { z } from "zod";

export const createSubjectSchema = z.object({
  courseLevelId: z.string().min(1),
  name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres").max(200),
  code: z.string().max(50).optional(),
  description: z.string().max(1000).optional(),
  hoursRequired: z.string().optional(),
  order: z.string().optional(),
});

export const updateSubjectSchema = z.object({
  name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres").max(200),
  code: z.string().max(50).optional(),
  description: z.string().max(1000).optional(),
  courseLevelId: z.string().min(1),
  hoursRequired: z.string().optional(),
  order: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
});

export const archiveSubjectSchema = z.object({
  subjectId: z.string().min(1),
  courseId: z.string().min(1),
});

export const deleteSubjectSchema = z.object({
  subjectId: z.string().min(1),
  courseId: z.string().min(1),
});

export type CreateSubjectSchema = z.infer<typeof createSubjectSchema>;
export type UpdateSubjectSchema = z.infer<typeof updateSubjectSchema>;
export type ArchiveSubjectSchema = z.infer<typeof archiveSubjectSchema>;
export type DeleteSubjectSchema = z.infer<typeof deleteSubjectSchema>;
