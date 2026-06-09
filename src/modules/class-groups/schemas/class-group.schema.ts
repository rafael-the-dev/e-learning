import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de data inválido (AAAA-MM-DD)")
  .optional();

export const createClassGroupSchema = z.object({
  name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres").max(200),
  code: z.string().max(50).optional(),
  courseId: z.string().min(1, "O curso é obrigatório"),
  courseLevelId: z.string().optional(),
  branchId: z.string().optional(),
  teacherId: z.string().optional(),
  academicYearId: z.string().min(1, "O ano letivo é obrigatório"),
  academicTermId: z.string().optional().nullable(),
  capacity: z.number().int().min(1, "A capacidade deve ser maior que 0").optional(),
  startDate: isoDate,
  endDate: isoDate,
  status: z
    .enum(["FORMING", "ACTIVE", "COMPLETED", "CANCELLED", "ARCHIVED"])
    .optional(),
});

export type CreateClassGroupSchema = z.infer<typeof createClassGroupSchema>;

const isoDateNullable = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de data inválido (AAAA-MM-DD)")
  .optional()
  .nullable();

export const updateClassGroupSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  code: z.string().max(50).optional().nullable(),
  courseId: z.string().min(1).optional(),
  courseLevelId: z.string().optional().nullable(),
  branchId: z.string().optional().nullable(),
  teacherId: z.string().optional().nullable(),
  academicYearId: z.string().min(1).optional(),
  academicTermId: z.string().optional().nullable(),
  capacity: z.number().int().min(1).optional(),
  startDate: isoDateNullable,
  endDate: isoDateNullable,
  status: z
    .enum(["FORMING", "ACTIVE", "COMPLETED", "CANCELLED", "ARCHIVED"])
    .optional(),
});

export type UpdateClassGroupSchema = z.infer<typeof updateClassGroupSchema>;

export const archiveClassGroupSchema = z.object({
  classGroupId: z.string().min(1),
});

export type ArchiveClassGroupSchema = z.infer<typeof archiveClassGroupSchema>;

export const deleteClassGroupSchema = z.object({
  classGroupId: z.string().min(1),
});

export type DeleteClassGroupSchema = z.infer<typeof deleteClassGroupSchema>;
