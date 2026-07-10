import { z } from "zod";

// =============================================================================
// EXAMINATION ENGINE — PHASE 5 CANDIDATE-REGISTRATION INPUT SCHEMAS
// -----------------------------------------------------------------------------
// Zod input schemas for the registration commands (register / override / withdraw
// / disqualify). Every schema is `.strict()` — unexpected fields are REJECTED, so
// a client can never smuggle `organizationId`, `status`, `eligibilityStatus`,
// `examAttemptId`, `attemptNumber`, any `*ById` actor id, or an `actor` field:
// those are owned by the server `ServiceContext`, the eligibility engine verdict,
// and the command's conditional write — never by the caller. Messages are PT-PT.
//
// The engine decides ACADEMIC/ADMINISTRATIVE eligibility; the command enforces the
// operational blockers. Override requires an explicit `reason` (the audit trail of
// who bypassed eligibility and why); disqualify likewise requires a `reason`.
// =============================================================================

export const registerExamCandidateSchema = z
  .object({
    examSessionId: z.string().min(1, "O identificador da sessão é obrigatório"),
    studentId: z.string().min(1, "O identificador do aluno é obrigatório"),
    enrollmentId: z.string().min(1, "O identificador da inscrição é obrigatório"),
    levelSubjectId: z.string().min(1, "A disciplina do nível é obrigatória"),
    assignedSeat: z.string().min(1).optional(),
    reason: z.string().min(1).optional(),
  })
  .strict();
export type RegisterExamCandidateInput = z.infer<typeof registerExamCandidateSchema>;

export const overrideExamCandidateEligibilitySchema = z
  .object({
    examSessionId: z.string().min(1, "O identificador da sessão é obrigatório"),
    studentId: z.string().min(1, "O identificador do aluno é obrigatório"),
    enrollmentId: z.string().min(1, "O identificador da inscrição é obrigatório"),
    levelSubjectId: z.string().min(1, "A disciplina do nível é obrigatória"),
    assignedSeat: z.string().min(1).optional(),
    reason: z.string().min(1, "O motivo do override é obrigatório"),
  })
  .strict();
export type OverrideExamCandidateEligibilityInput = z.infer<
  typeof overrideExamCandidateEligibilitySchema
>;

export const withdrawExamCandidateSchema = z
  .object({
    examCandidateId: z.string().min(1, "O identificador do candidato é obrigatório"),
    reason: z.string().min(1).optional(),
  })
  .strict();
export type WithdrawExamCandidateInput = z.infer<typeof withdrawExamCandidateSchema>;

export const disqualifyExamCandidateSchema = z
  .object({
    examCandidateId: z.string().min(1, "O identificador do candidato é obrigatório"),
    reason: z.string().min(1, "O motivo da desqualificação é obrigatório"),
  })
  .strict();
export type DisqualifyExamCandidateInput = z.infer<typeof disqualifyExamCandidateSchema>;
