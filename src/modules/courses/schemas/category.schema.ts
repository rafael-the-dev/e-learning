import { z } from "zod";

export const createCourseCategorySchema = z.object({
  name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres").max(200),
  description: z.string().max(1000).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export const updateCourseCategorySchema = z.object({
  name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres").max(200),
  description: z.string().max(1000).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
});

export const archiveCourseCategorySchema = z.object({
  categoryId: z.string().min(1),
});

export const deleteCourseCategorySchema = z.object({
  categoryId: z.string().min(1),
});

export type CreateCourseCategorySchema = z.infer<typeof createCourseCategorySchema>;
export type UpdateCourseCategorySchema = z.infer<typeof updateCourseCategorySchema>;
export type ArchiveCourseCategorySchema = z.infer<typeof archiveCourseCategorySchema>;
export type DeleteCourseCategorySchema = z.infer<typeof deleteCourseCategorySchema>;
