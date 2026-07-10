import { z } from "zod";
import { ExamResultCode } from "@/modules/examinations/constants";

// =============================================================================
// EXAMINATION ENGINE — PHASE 7 RESULT-ENTRY INPUT SCHEMAS
// -----------------------------------------------------------------------------
// Zod input schemas for the exam result-entry commands (create / update-draft /
// submit + bulk). Every schema is `.strict()` — unexpected fields are REJECTED,
// so a client can never smuggle `organizationId`, `studentId`, `enrollmentId`,
// `levelSubjectId`, `examAttemptId`, `status`, `normalizedScore`, `markerId`,
// `reviewedById`, `approvedById`, `publishedAt`, or any actor id: those are owned
// by the server `ServiceContext`, the attendance fact, and the command's own
// writes. These schemas describe an OFFICIAL EXAM FACT up to DRAFT/SUBMITTED only
// — there is no final-grade / pass-fail / progression / transcript field here.
// Messages are PT-PT.
//
// `resultCode` is OPTIONAL on input: the command DERIVES it from the recorded
// attendance status (PRESENT/LATE→SCORED; ABSENT/EXCUSED/DISQUALIFIED→non-scored).
// When supplied it must MATCH that derivation (else the command rejects it) — it
// is never a free choice. Numeric bounds (score ≥ 0, score ≤ maxScore, maxScore
// > 0) are enforced by the command against the resolved values.
// =============================================================================

/** Tuple helper: a const-object's values as a non-empty tuple for `z.enum`. */
function values<T extends Record<string, string>>(obj: T): [string, ...string[]] {
  return Object.values(obj) as [string, ...string[]];
}

const resultCode = z.enum(values(ExamResultCode));

/** Shared create fields (also the per-item shape in a bulk-create request). */
const createFields = {
  examCandidateId: z.string().min(1, "O identificador do candidato é obrigatório"),
  score: z.number().optional(),
  maxScore: z.number(),
  resultCode: resultCode.optional(),
  remarks: z.string().min(1).optional(),
  reason: z.string().min(1).optional(),
} as const;

export const createExamResultSchema = z.object(createFields).strict();
// Named `…CommandInput` to avoid colliding with the repository's
// `CreateExamResultInput` (persistence shape) under the module `export *` barrel.
export type CreateExamResultCommandInput = z.infer<typeof createExamResultSchema>;

export const updateDraftExamResultSchema = z
  .object({
    examResultId: z.string().min(1, "O identificador do resultado é obrigatório"),
    score: z.number().optional(),
    maxScore: z.number().optional(),
    resultCode: resultCode.optional(),
    remarks: z.string().min(1).optional(),
    reason: z.string().min(1).optional(),
  })
  .strict();
export type UpdateDraftExamResultInput = z.infer<typeof updateDraftExamResultSchema>;

export const submitExamResultSchema = z
  .object({
    examResultId: z.string().min(1, "O identificador do resultado é obrigatório"),
    reason: z.string().min(1).optional(),
  })
  .strict();
export type SubmitExamResultInput = z.infer<typeof submitExamResultSchema>;

// ─── Bulk ──────────────────────────────────────────────────────────────────────

const bulkCreateItemSchema = z.object(createFields).strict();

export const bulkCreateExamResultsSchema = z
  .object({
    examSessionId: z.string().min(1, "O identificador da sessão é obrigatório"),
    items: z.array(bulkCreateItemSchema).min(1, "É necessário pelo menos um candidato"),
    stopOnFailure: z.boolean().optional().default(false),
  })
  .strict();
// `z.input` (not `z.infer`) so the `stopOnFailure` default keeps the field OPTIONAL
// for callers; the command's `parse` still yields the defaulted `boolean` output.
export type BulkCreateExamResultsInput = z.input<typeof bulkCreateExamResultsSchema>;

const bulkSubmitItemSchema = z
  .object({
    examResultId: z.string().min(1, "O identificador do resultado é obrigatório"),
    reason: z.string().min(1).optional(),
  })
  .strict();

export const bulkSubmitExamResultsSchema = z
  .object({
    examSessionId: z.string().min(1, "O identificador da sessão é obrigatório"),
    items: z.array(bulkSubmitItemSchema).min(1, "É necessário pelo menos um resultado"),
    stopOnFailure: z.boolean().optional().default(false),
  })
  .strict();
export type BulkSubmitExamResultsInput = z.input<typeof bulkSubmitExamResultsSchema>;
