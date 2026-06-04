import { z } from "zod";

// Zod v4: use z.union([]) instead of .or()

export const createCourseSchema = z.object({
  name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres").max(200),
  code: z.string().max(50).optional(),
  description: z.string().max(2000).optional(),
  category: z.string().max(50).optional(),
  totalHours: z.string().optional(),
  price: z.string().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "INACTIVE"]).optional(),
});

export const updateCourseSchema = z.object({
  name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres").max(200),
  code: z.string().max(50).optional(),
  description: z.string().max(2000).optional(),
  category: z.string().max(50).optional(),
  totalHours: z.string().optional(),
  price: z.string().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
});

export const archiveCourseSchema = z.object({
  courseId: z.string().min(1),
});

export const deleteCourseSchema = z.object({
  courseId: z.string().min(1),
});

export type CreateCourseSchema = z.infer<typeof createCourseSchema>;
export type UpdateCourseSchema = z.infer<typeof updateCourseSchema>;
export type ArchiveCourseSchema = z.infer<typeof archiveCourseSchema>;
export type DeleteCourseSchema = z.infer<typeof deleteCourseSchema>;
