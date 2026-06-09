import { z } from "zod";

export const assignSubjectSchema = z
  .object({
    subjectId: z.string().min(1, "Selecione uma disciplina"),
    order: z.number().int().min(0).optional(),
    workloadHours: z
      .number()
      .int()
      .min(1, "A carga horária deve ser maior que 0")
      .optional()
      .nullable(),
    theoryHours: z
      .number()
      .int()
      .min(0, "As horas teóricas não podem ser negativas")
      .optional()
      .nullable(),
    practicalHours: z
      .number()
      .int()
      .min(0, "As horas práticas não podem ser negativas")
      .optional()
      .nullable(),
    minimumPassingGrade: z
      .number()
      .min(0, "A nota mínima deve ser entre 0 e 100")
      .max(100, "A nota mínima deve ser entre 0 e 100")
      .optional()
      .nullable(),
    minimumAttendancePercentage: z
      .number()
      .min(0, "A frequência mínima deve ser entre 0 e 100")
      .max(100, "A frequência mínima deve ser entre 0 e 100")
      .optional()
      .nullable(),
    maxAbsences: z
      .number()
      .int()
      .min(0, "O número máximo de faltas não pode ser negativo")
      .optional()
      .nullable(),
    isRequired: z.boolean().default(true),
    allowRetakeExam: z.boolean().default(true),
    allowCompensation: z.boolean().default(false),
    certificateRequired: z.boolean().default(false),
    status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]),
  })
  .superRefine((data, ctx) => {
    const theory = data.theoryHours ?? 0;
    const practical = data.practicalHours ?? 0;
    const workload = data.workloadHours ?? null;
    if (workload !== null && theory + practical > workload) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "A soma das horas teóricas e práticas não pode exceder a carga horária total",
        path: ["theoryHours"],
      });
    }
  });

export const updateLevelSubjectSchema = z
  .object({
    order: z.number().int().min(0).optional(),
    workloadHours: z
      .number()
      .int()
      .min(1, "A carga horária deve ser maior que 0")
      .optional()
      .nullable(),
    theoryHours: z
      .number()
      .int()
      .min(0, "As horas teóricas não podem ser negativas")
      .optional()
      .nullable(),
    practicalHours: z
      .number()
      .int()
      .min(0, "As horas práticas não podem ser negativas")
      .optional()
      .nullable(),
    minimumPassingGrade: z
      .number()
      .min(0, "A nota mínima deve ser entre 0 e 100")
      .max(100, "A nota mínima deve ser entre 0 e 100")
      .optional()
      .nullable(),
    minimumAttendancePercentage: z
      .number()
      .min(0, "A frequência mínima deve ser entre 0 e 100")
      .max(100, "A frequência mínima deve ser entre 0 e 100")
      .optional()
      .nullable(),
    maxAbsences: z
      .number()
      .int()
      .min(0, "O número máximo de faltas não pode ser negativo")
      .optional()
      .nullable(),
    isRequired: z.boolean().optional(),
    allowRetakeExam: z.boolean().optional(),
    allowCompensation: z.boolean().optional(),
    certificateRequired: z.boolean().optional(),
    status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
  })
  .superRefine((data, ctx) => {
    const theory = data.theoryHours ?? 0;
    const practical = data.practicalHours ?? 0;
    const workload = data.workloadHours ?? null;
    if (workload !== null && theory + practical > workload) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "A soma das horas teóricas e práticas não pode exceder a carga horária total",
        path: ["theoryHours"],
      });
    }
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
