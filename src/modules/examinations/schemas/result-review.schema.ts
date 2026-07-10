import { z } from "zod";

// =============================================================================
// EXAMINATION ENGINE — PHASE 8 RESULT-REVIEW INPUT SCHEMAS
// -----------------------------------------------------------------------------
// Zod input schemas for the exam result review / approval / return-for-correction
// commands (+ bulk review / approve). Every schema is `.strict()` — unexpected
// fields are REJECTED, so a client can never smuggle `organizationId`, `status`,
// `reviewedById`, `approvedById`, `markerId`, `publishedAt`, `score`, `resultCode`
// or any actor id: those are owned by the server `ServiceContext`, the attendance
// fact, and the command's own writes. These schemas describe an OFFICIAL EXAM FACT
// up to REVIEWED / APPROVED only — there is no publication / final-grade / pass-fail
// / progression / transcript / certificate field here. Messages are PT-PT.
//
// `remarks` / `reason` are free-text notes recorded in the ExamEvent / audit trail
// only; they never change the score, resultCode or any lifecycle column. The
// return-for-correction schema is the only one that REQUIRES a `reason`.
// =============================================================================

export const reviewExamResultSchema = z
  .object({
    examResultId: z.string().min(1, "O identificador do resultado é obrigatório"),
    remarks: z.string().min(1).optional(),
    reason: z.string().min(1).optional(),
  })
  .strict();
export type ReviewExamResultInput = z.infer<typeof reviewExamResultSchema>;

export const approveExamResultSchema = z
  .object({
    examResultId: z.string().min(1, "O identificador do resultado é obrigatório"),
    reason: z.string().min(1).optional(),
  })
  .strict();
export type ApproveExamResultInput = z.infer<typeof approveExamResultSchema>;

export const returnExamResultForCorrectionSchema = z
  .object({
    examResultId: z.string().min(1, "O identificador do resultado é obrigatório"),
    reason: z.string().min(1, "É obrigatório indicar o motivo"),
  })
  .strict();
export type ReturnExamResultForCorrectionInput = z.infer<
  typeof returnExamResultForCorrectionSchema
>;

// ─── Bulk ──────────────────────────────────────────────────────────────────────

const bulkReviewItemSchema = z
  .object({
    examResultId: z.string().min(1, "O identificador do resultado é obrigatório"),
    remarks: z.string().min(1).optional(),
    reason: z.string().min(1).optional(),
  })
  .strict();

export const bulkReviewExamResultsSchema = z
  .object({
    examSessionId: z.string().min(1, "O identificador da sessão é obrigatório"),
    items: z.array(bulkReviewItemSchema).min(1, "É necessário pelo menos um resultado"),
    stopOnFailure: z.boolean().optional().default(false),
  })
  .strict();
// `z.input` (not `z.infer`) so the `stopOnFailure` default keeps the field OPTIONAL
// for callers; the command's `parse` still yields the defaulted `boolean` output.
export type BulkReviewExamResultsInput = z.input<typeof bulkReviewExamResultsSchema>;

const bulkApproveItemSchema = z
  .object({
    examResultId: z.string().min(1, "O identificador do resultado é obrigatório"),
    reason: z.string().min(1).optional(),
  })
  .strict();

export const bulkApproveExamResultsSchema = z
  .object({
    examSessionId: z.string().min(1, "O identificador da sessão é obrigatório"),
    items: z.array(bulkApproveItemSchema).min(1, "É necessário pelo menos um resultado"),
    stopOnFailure: z.boolean().optional().default(false),
  })
  .strict();
export type BulkApproveExamResultsInput = z.input<typeof bulkApproveExamResultsSchema>;
