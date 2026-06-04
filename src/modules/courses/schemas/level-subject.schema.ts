import { z } from "zod";

export const assignSubjectSchema = z.object({
  subjectId: z.string().min(1, "Selecione uma disciplina"),
  order: z.number().int().min(0).optional(),
  workloadHours: z
    .number()
    .int()
    .min(1, "A carga horária deve ser maior que 0")
    .optional()
    .nullable(),
  minimumPassingGrade: z
    .number()
    .min(0, "A nota mínima deve ser entre 0 e 100")
    .max(100, "A nota mínima deve ser entre 0 e 100")
    .optional()
    .nullable(),
  isRequired: z.boolean(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]),
});

export const updateLevelSubjectSchema = z.object({
  order: z.number().int().min(0).optional(),
  workloadHours: z
    .number()
    .int()
    .min(1, "A carga horária deve ser maior que 0")
    .optional()
    .nullable(),
  minimumPassingGrade: z
    .number()
    .min(0, "A nota mínima deve ser entre 0 e 100")
    .max(100, "A nota mínima deve ser entre 0 e 100")
    .optional()
    .nullable(),
  isRequired: z.boolean().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
});

export const removeLevelSubjectSchema = z.object({
  levelSubjectId: z.string().min(1),
});

export const reorderLevelSubjectsSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        order: z.number().int().min(0),
      })
    )
    .min(1),
});

export type AssignSubjectSchema = z.infer<typeof assignSubjectSchema>;
export type UpdateLevelSubjectSchema = z.infer<typeof updateLevelSubjectSchema>;
export type RemoveLevelSubjectSchema = z.infer<typeof removeLevelSubjectSchema>;
export type ReorderLevelSubjectsSchema = z.infer<typeof reorderLevelSubjectsSchema>;
