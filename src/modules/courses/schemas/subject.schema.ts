import { z } from "zod";

export const createSubjectSchema = z.object({
  name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres").max(200),
  code: z.string().max(50).optional(),
  description: z.string().max(2000).optional(),
});

export const updateSubjectSchema = z.object({
  name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres").max(200).optional(),
  code: z.string().max(50).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
});

export const archiveSubjectSchema = z.object({
  subjectId: z.string().min(1),
});

export const softDeleteSubjectSchema = z.object({
  subjectId: z.string().min(1),
});

export type CreateSubjectSchema = z.infer<typeof createSubjectSchema>;
export type UpdateSubjectSchema = z.infer<typeof updateSubjectSchema>;
export type ArchiveSubjectSchema = z.infer<typeof archiveSubjectSchema>;
export type SoftDeleteSubjectSchema = z.infer<typeof softDeleteSubjectSchema>;
