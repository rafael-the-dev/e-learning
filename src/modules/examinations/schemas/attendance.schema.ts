import { z } from "zod";
import { ExamAttendanceStatus } from "@/modules/examinations/constants";

// =============================================================================
// EXAMINATION ENGINE — PHASE 6 ATTENDANCE INPUT SCHEMAS
// -----------------------------------------------------------------------------
// Zod input schemas for the exam-attendance commands (mark / bulk / correct).
// Every schema is `.strict()` — unexpected fields are REJECTED, so a client can
// never smuggle `organizationId`, `actorId`, `markedById`, `markedAt`,
// `studentId`, `enrollmentId`, or any result field: those are owned by the server
// `ServiceContext` and the command's own writes. Exam attendance is SEPARATE from
// the class Attendance Engine (E-10): these schemas describe an examination fact
// only — no score, no pass/fail, no class-attendance field. Messages are PT-PT.
//
// EXCUSED must carry a justification (`remarks` OR `reason`); DISQUALIFIED must
// carry a `reason`. A correction always requires a `reason` (the audit trail of
// who changed the recorded attendance and why).
// =============================================================================

/** Tuple helper: a const-object's values as a non-empty tuple for `z.enum`. */
function values<T extends Record<string, string>>(obj: T): [string, ...string[]] {
  return Object.values(obj) as [string, ...string[]];
}

const attendanceStatus = z.enum(values(ExamAttendanceStatus));

/** Shared mark fields (also the per-item shape in a bulk request). */
const markFields = {
  examCandidateId: z.string().min(1, "O identificador do candidato é obrigatório"),
  status: attendanceStatus,
  checkedInAt: z.coerce.date().optional(),
  remarks: z.string().min(1).optional(),
  reason: z.string().min(1).optional(),
} as const;

/** EXCUSED needs a justification (remarks OR reason); DISQUALIFIED needs a reason. */
function refineMarkReason(
  v: { status: string; remarks?: string; reason?: string },
  ctx: z.RefinementCtx
): void {
  if (v.status === ExamAttendanceStatus.EXCUSED && !v.remarks && !v.reason) {
    ctx.addIssue({
      code: "custom",
      path: ["reason"],
      message: "Uma presença justificada requer observações ou um motivo",
    });
  }
  if (v.status === ExamAttendanceStatus.DISQUALIFIED && !v.reason) {
    ctx.addIssue({
      code: "custom",
      path: ["reason"],
      message: "Uma desqualificação requer um motivo",
    });
  }
}

export const markExamCandidateAttendanceSchema = z
  .object(markFields)
  .strict()
  .superRefine(refineMarkReason);
export type MarkExamCandidateAttendanceInput = z.infer<typeof markExamCandidateAttendanceSchema>;

const bulkAttendanceItemSchema = z.object(markFields).strict().superRefine(refineMarkReason);

export const bulkMarkExamAttendanceSchema = z
  .object({
    examSessionId: z.string().min(1, "O identificador da sessão é obrigatório"),
    items: z.array(bulkAttendanceItemSchema).min(1, "É necessário pelo menos um candidato"),
    stopOnFailure: z.boolean().optional().default(false),
  })
  .strict();
// `z.input` (not `z.infer`) so the `stopOnFailure` default keeps the field OPTIONAL
// for callers; the command's `parse` still yields the defaulted `boolean` output.
export type BulkMarkExamAttendanceInput = z.input<typeof bulkMarkExamAttendanceSchema>;

export const correctExamCandidateAttendanceSchema = z
  .object({
    examCandidateId: z.string().min(1, "O identificador do candidato é obrigatório"),
    status: attendanceStatus,
    checkedInAt: z.coerce.date().optional(),
    remarks: z.string().min(1).optional(),
    reason: z.string().min(1, "O motivo da correção é obrigatório"),
  })
  .strict();
export type CorrectExamCandidateAttendanceInput = z.infer<
  typeof correctExamCandidateAttendanceSchema
>;
