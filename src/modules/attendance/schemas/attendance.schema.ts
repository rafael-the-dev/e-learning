import { z } from "zod";

// =============================================================================
// ATTENDANCE SCHEMAS — Zod validation for all attendance commands
// =============================================================================

// ─── Session ──────────────────────────────────────────────────────────────────

export const createAttendanceSessionSchema = z.object({
  academicYearId: z.string().min(1, "Ano letivo obrigatório"),
  academicTermId: z.string().optional(),
  classGroupId: z.string().min(1, "Turma obrigatória"),
  courseId: z.string().min(1, "Curso obrigatório"),
  courseLevelId: z.string().min(1, "Nível obrigatório"),
  subjectId: z.string().min(1, "Disciplina obrigatória"),
  levelSubjectId: z.string().min(1, "Configuração de disciplina obrigatória"),
  teacherId: z.string().optional(),
  classroomId: z.string().optional(),
  scheduleSlotId: z.string().optional(),
  sessionDate: z.string().min(1, "Data da sessão obrigatória"),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Hora de início inválida (HH:MM)"),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Hora de fim inválida (HH:MM)"),
  title: z.string().max(200).optional(),
  notes: z.string().optional(),
});
export type CreateAttendanceSessionSchema = z.infer<typeof createAttendanceSessionSchema>;

export const updateAttendanceSessionSchema = z.object({
  sessionId: z.string().min(1),
  teacherId: z.string().optional().nullable(),
  classroomId: z.string().optional().nullable(),
  scheduleSlotId: z.string().optional().nullable(),
  sessionDate: z.string().optional(),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Hora de início inválida")
    .optional(),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Hora de fim inválida")
    .optional(),
  title: z.string().max(200).optional().nullable(),
  notes: z.string().optional().nullable(),
});
export type UpdateAttendanceSessionSchema = z.infer<typeof updateAttendanceSessionSchema>;

export const cancelAttendanceSessionSchema = z.object({
  sessionId: z.string().min(1),
  reason: z.string().optional(),
});
export type CancelAttendanceSessionSchema = z.infer<typeof cancelAttendanceSessionSchema>;

export const completeAttendanceSessionSchema = z.object({
  sessionId: z.string().min(1),
});
export type CompleteAttendanceSessionSchema = z.infer<typeof completeAttendanceSessionSchema>;

// ─── Records ──────────────────────────────────────────────────────────────────

export const markAttendanceSchema = z.object({
  sessionId: z.string().min(1, "Sessão obrigatória"),
  studentId: z.string().min(1, "Aluno obrigatório"),
  status: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED", "REMOTE"]),
  lateMinutes: z.number().int().min(0).optional(),
  minutesAttended: z.number().int().min(0).optional(),
  notes: z.string().optional(),
});
export type MarkAttendanceSchema = z.infer<typeof markAttendanceSchema>;

export const bulkMarkAttendanceSchema = z.object({
  sessionId: z.string().min(1, "Sessão obrigatória"),
  records: z
    .array(
      z.object({
        studentId: z.string().min(1),
        enrollmentId: z.string().optional(),
        status: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED", "REMOTE"]),
        lateMinutes: z.number().int().min(0).optional(),
        minutesAttended: z.number().int().min(0).optional(),
        notes: z.string().optional(),
      })
    )
    .min(1, "Pelo menos um registo obrigatório"),
});
export type BulkMarkAttendanceSchema = z.infer<typeof bulkMarkAttendanceSchema>;

export const updateAttendanceRecordSchema = z.object({
  recordId: z.string().min(1),
  status: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED", "REMOTE"]),
  lateMinutes: z.number().int().min(0).optional().nullable(),
  minutesAttended: z.number().int().min(0).optional(),
  notes: z.string().optional().nullable(),
});
export type UpdateAttendanceRecordSchema = z.infer<typeof updateAttendanceRecordSchema>;

// ─── Justifications ────────────────────────────────────────────────────────────

export const createAttendanceJustificationSchema = z.object({
  attendanceRecordId: z.string().min(1, "Registo de presença obrigatório"),
  reason: z.string().min(5, "Motivo deve ter pelo menos 5 caracteres"),
  attachmentUrl: z.string().url("URL inválido").optional(),
});
export type CreateAttendanceJustificationSchema = z.infer<
  typeof createAttendanceJustificationSchema
>;

export const approveAttendanceJustificationSchema = z.object({
  justificationId: z.string().min(1),
  reviewNotes: z.string().optional(),
});
export type ApproveAttendanceJustificationSchema = z.infer<
  typeof approveAttendanceJustificationSchema
>;

export const rejectAttendanceJustificationSchema = z.object({
  justificationId: z.string().min(1),
  reviewNotes: z.string().min(5, "Motivo da rejeição deve ter pelo menos 5 caracteres"),
});
export type RejectAttendanceJustificationSchema = z.infer<
  typeof rejectAttendanceJustificationSchema
>;
