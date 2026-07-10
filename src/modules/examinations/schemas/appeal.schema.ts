import { z } from "zod";

// =============================================================================
// EXAMINATION ENGINE — PHASE 10 APPEALS & RESULT-REVISION INPUT SCHEMAS
// -----------------------------------------------------------------------------
// Zod input schemas for the exam appeal workflow (create / review / approve /
// reject / withdraw). Every schema is `.strict()` — unexpected fields are
// REJECTED, so a client can never smuggle `organizationId`, `studentId`,
// `requestedById`, `decidedById`, `status`, `score`, or any actor id: the acting
// Student is resolved server-side from the session, the decision actor / timestamps
// are owned by the command `ServiceContext` / clock, and every revision score is
// bounded by the result's own `maxScore` at command time. Messages are PT-PT.
//
// `reason` is a free-text motive recorded on the appeal + the ExamEvent / audit
// trail: REQUIRED on create (a recourse always needs a stated motive) and on the
// approve / reject decisions (a decision always needs a documented justification),
// OPTIONAL on review / withdraw.
// =============================================================================

export const createExamAppealSchema = z
  .object({
    examResultId: z.string().min(1),
    reason: z.string().min(1, "É obrigatório indicar o motivo do recurso"),
  })
  .strict();
export type CreateExamAppealCommandInput = z.infer<typeof createExamAppealSchema>;

export const reviewExamAppealSchema = z
  .object({
    appealId: z.string().min(1),
    reason: z.string().min(1).optional(),
  })
  .strict();
export type ReviewExamAppealInput = z.infer<typeof reviewExamAppealSchema>;

export const approveExamAppealSchema = z
  .object({
    appealId: z.string().min(1),
    revisedScore: z.number(),
    reason: z.string().min(1, "É obrigatório indicar o motivo da decisão"),
  })
  .strict();
export type ApproveExamAppealInput = z.infer<typeof approveExamAppealSchema>;

export const rejectExamAppealSchema = z
  .object({
    appealId: z.string().min(1),
    reason: z.string().min(1, "É obrigatório indicar o motivo da rejeição"),
  })
  .strict();
export type RejectExamAppealInput = z.infer<typeof rejectExamAppealSchema>;

export const withdrawExamAppealSchema = z
  .object({
    appealId: z.string().min(1),
    reason: z.string().min(1).optional(),
  })
  .strict();
export type WithdrawExamAppealInput = z.infer<typeof withdrawExamAppealSchema>;
