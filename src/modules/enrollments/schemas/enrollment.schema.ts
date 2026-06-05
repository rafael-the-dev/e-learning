import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de data inválido (AAAA-MM-DD)")
  .optional()
  .nullable();

export const createEnrollmentSchema = z.object({
  branchId: z.string().min(1, "A filial é obrigatória"),
  studentId: z.string().min(1, "O aluno é obrigatório"),
  courseId: z.string().min(1, "O curso é obrigatório"),
  courseLevelId: z.string().optional().nullable(),
  classGroupId: z.string().optional().nullable(),
  enrollmentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de data inválido (AAAA-MM-DD)"),
  startDate: isoDate,
  expectedEndDate: isoDate,
  notes: z.string().max(2000).optional().nullable(),
});

export type CreateEnrollmentSchema = z.infer<typeof createEnrollmentSchema>;

export const updateEnrollmentSchema = z.object({
  branchId: z.string().min(1).optional().nullable(),
  courseLevelId: z.string().optional().nullable(),
  classGroupId: z.string().optional().nullable(),
  startDate: isoDate,
  expectedEndDate: isoDate,
  notes: z.string().max(2000).optional().nullable(),
});

export type UpdateEnrollmentSchema = z.infer<typeof updateEnrollmentSchema>;

export const activateEnrollmentSchema = z.object({
  enrollmentId: z.string().min(1),
  reason: z.string().max(500).optional().nullable(),
});

export type ActivateEnrollmentSchema = z.infer<typeof activateEnrollmentSchema>;

export const suspendEnrollmentSchema = z.object({
  enrollmentId: z.string().min(1),
  reason: z.string().min(1, "O motivo de suspensão é obrigatório").max(500),
});

export type SuspendEnrollmentSchema = z.infer<typeof suspendEnrollmentSchema>;

export const cancelEnrollmentSchema = z.object({
  enrollmentId: z.string().min(1),
  reason: z.string().min(1, "O motivo de cancelamento é obrigatório").max(500),
});

export type CancelEnrollmentSchema = z.infer<typeof cancelEnrollmentSchema>;

export const completeEnrollmentSchema = z.object({
  enrollmentId: z.string().min(1),
  reason: z.string().max(500).optional().nullable(),
});

export type CompleteEnrollmentSchema = z.infer<typeof completeEnrollmentSchema>;

export const deleteEnrollmentSchema = z.object({
  enrollmentId: z.string().min(1),
});

export type DeleteEnrollmentSchema = z.infer<typeof deleteEnrollmentSchema>;
