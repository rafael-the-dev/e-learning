import { z } from "zod";
import { ExamInvigilatorRole } from "@/modules/examinations/constants";

// =============================================================================
// EXAMINATION ENGINE — PHASE 4 SCHEDULING INPUT SCHEMAS
// -----------------------------------------------------------------------------
// Zod input schemas for the scheduling commands (period / room / session
// lifecycle + invigilator assignment). Every schema is `.strict()` (unexpected
// fields are rejected) with PT-PT messages. They NEVER accept `organizationId`,
// `status`, or any actor id — those come from the server `ServiceContext`; the
// status is owned by the command's conditional write. Dates are coerced to a
// real `Date` (accepts an ISO string or a Date). Capacity is a positive integer.
//
// The inferred type names are deliberately distinct from the persistence input
// types in `../types/repository` (e.g. `CreateExamPeriodCommandInput` vs the
// repository's `CreateExamPeriodInput`) so the module barrel can re-export both
// without an ambiguous name collision.
// =============================================================================

/** Tuple helper: a const-object's values as a non-empty tuple for `z.enum`. */
function values<T extends Record<string, string>>(obj: T): [string, ...string[]] {
  return Object.values(obj) as [string, ...string[]];
}

const dateValue = z.coerce.date();

// ─── ExamPeriod ───────────────────────────────────────────────────────────────

export const createExamPeriodSchema = z
  .object({
    name: z.string().min(1, "O nome é obrigatório"),
    academicYear: z.string().min(1, "O ano letivo é obrigatório"),
    term: z.string().min(1).optional(),
    startsAt: dateValue,
    endsAt: dateValue,
    branchId: z.string().min(1).optional(),
  })
  .strict()
  .refine((v) => v.startsAt < v.endsAt, {
    message: "A data de início deve ser anterior à data de fim",
    path: ["endsAt"],
  });
export type CreateExamPeriodCommandInput = z.input<typeof createExamPeriodSchema>;

export const openExamPeriodSchema = z
  .object({ periodId: z.string().min(1, "O identificador do período é obrigatório") })
  .strict();
export type OpenExamPeriodInput = z.infer<typeof openExamPeriodSchema>;

export const lockExamPeriodSchema = z
  .object({ periodId: z.string().min(1, "O identificador do período é obrigatório") })
  .strict();
export type LockExamPeriodInput = z.infer<typeof lockExamPeriodSchema>;

export const completeExamPeriodSchema = z
  .object({ periodId: z.string().min(1, "O identificador do período é obrigatório") })
  .strict();
export type CompleteExamPeriodInput = z.infer<typeof completeExamPeriodSchema>;

export const cancelExamPeriodSchema = z
  .object({
    periodId: z.string().min(1, "O identificador do período é obrigatório"),
    reason: z.string().min(1, "O motivo é obrigatório"),
  })
  .strict();
export type CancelExamPeriodInput = z.infer<typeof cancelExamPeriodSchema>;

// ─── ExamRoom ───────────────────────────────────────────────────────────────

export const createExamRoomSchema = z
  .object({
    name: z.string().min(1, "O nome é obrigatório"),
    code: z.string().min(1).optional(),
    capacity: z.number().int().positive("A capacidade deve ser maior que zero"),
    branchId: z.string().min(1).optional(),
    description: z.string().optional(),
  })
  .strict();
export type CreateExamRoomCommandInput = z.infer<typeof createExamRoomSchema>;

export const updateExamRoomSchema = z
  .object({
    roomId: z.string().min(1, "O identificador da sala é obrigatório"),
    name: z.string().min(1).optional(),
    code: z.string().min(1).optional(),
    capacity: z.number().int().positive("A capacidade deve ser maior que zero").optional(),
    description: z.string().optional(),
    status: z.enum(["ACTIVE", "INACTIVE"], { message: "Estado da sala inválido" }).optional(),
  })
  .strict();
export type UpdateExamRoomCommandInput = z.infer<typeof updateExamRoomSchema>;

export const archiveExamRoomSchema = z
  .object({ roomId: z.string().min(1, "O identificador da sala é obrigatório") })
  .strict();
export type ArchiveExamRoomCommandInput = z.infer<typeof archiveExamRoomSchema>;

// ─── ExamSession ───────────────────────────────────────────────────────────────

export const createExamSessionSchema = z
  .object({
    periodId: z.string().min(1, "O identificador do período é obrigatório"),
    levelSubjectId: z.string().min(1, "A disciplina do nível é obrigatória"),
    courseId: z.string().min(1).optional(),
    courseLevelId: z.string().min(1).optional(),
    branchId: z.string().min(1).optional(),
    roomId: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    startsAt: dateValue,
    endsAt: dateValue,
    capacity: z.number().int().positive("A capacidade deve ser maior que zero"),
    instructions: z.string().optional(),
  })
  .strict()
  .refine((v) => v.startsAt < v.endsAt, {
    message: "A data de início deve ser anterior à data de fim",
    path: ["endsAt"],
  });
export type CreateExamSessionCommandInput = z.input<typeof createExamSessionSchema>;

export const scheduleExamSessionSchema = z
  .object({ sessionId: z.string().min(1, "O identificador da sessão é obrigatório") })
  .strict();
export type ScheduleExamSessionInput = z.infer<typeof scheduleExamSessionSchema>;

export const lockExamSessionSchema = z
  .object({ sessionId: z.string().min(1, "O identificador da sessão é obrigatório") })
  .strict();
export type LockExamSessionInput = z.infer<typeof lockExamSessionSchema>;

export const startExamSessionSchema = z
  .object({ sessionId: z.string().min(1, "O identificador da sessão é obrigatório") })
  .strict();
export type StartExamSessionInput = z.infer<typeof startExamSessionSchema>;

export const completeExamSessionSchema = z
  .object({ sessionId: z.string().min(1, "O identificador da sessão é obrigatório") })
  .strict();
export type CompleteExamSessionInput = z.infer<typeof completeExamSessionSchema>;

export const cancelExamSessionSchema = z
  .object({
    sessionId: z.string().min(1, "O identificador da sessão é obrigatório"),
    reason: z.string().min(1, "O motivo é obrigatório"),
  })
  .strict();
export type CancelExamSessionInput = z.infer<typeof cancelExamSessionSchema>;

// ─── ExamInvigilatorAssignment ────────────────────────────────────────────────

export const assignExamInvigilatorSchema = z
  .object({
    examSessionId: z.string().min(1, "O identificador da sessão é obrigatório"),
    teacherId: z.string().min(1).optional(),
    userId: z.string().min(1).optional(),
    role: z.enum(values(ExamInvigilatorRole), { message: "Função de vigilância inválida" }),
  })
  .strict()
  .refine((v) => Number(Boolean(v.teacherId)) + Number(Boolean(v.userId)) === 1, {
    message: "Indique exatamente um: formador ou utilizador",
    path: ["teacherId"],
  });
export type AssignExamInvigilatorInput = z.infer<typeof assignExamInvigilatorSchema>;
