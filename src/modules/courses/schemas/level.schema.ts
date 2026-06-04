import { z } from "zod";

export const createCourseLevelSchema = z.object({
  name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres").max(200),
  code: z.string().max(50).optional(),
  description: z.string().max(1000).optional(),
  order: z.string().optional(),
  totalHours: z.string().optional(),
});

export const updateCourseLevelSchema = z.object({
  name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres").max(200),
  code: z.string().max(50).optional(),
  description: z.string().max(1000).optional(),
  order: z.string().optional(),
  totalHours: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
});

export const archiveCourseLevelSchema = z.object({
  levelId: z.string().min(1),
  courseId: z.string().min(1),
});

export const deleteCourseLevelSchema = z.object({
  levelId: z.string().min(1),
  courseId: z.string().min(1),
});

export type CreateCourseLevelSchema = z.infer<typeof createCourseLevelSchema>;
export type UpdateCourseLevelSchema = z.infer<typeof updateCourseLevelSchema>;
export type ArchiveCourseLevelSchema = z.infer<typeof archiveCourseLevelSchema>;
export type DeleteCourseLevelSchema = z.infer<typeof deleteCourseLevelSchema>;
