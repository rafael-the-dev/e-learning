import { z } from "zod";

// =============================================================================
// EXAMINATION ENGINE — PHASE 11B EXAM→GRADE-COMPONENT BINDING SCHEMAS (ADR-014)
// -----------------------------------------------------------------------------
// Zod input schemas for the explicit binding that maps an ExamSession's results
// onto a Grade Engine `assessmentComponentId`. Every schema is `.strict()` —
// unexpected fields are REJECTED, so a client can never smuggle `organizationId`,
// any actor id (`createdById`), or a `levelSubjectId`: compatibility is validated
// server-side against the real AssessmentComponent / AssessmentPolicy, and the
// actor is owned by the `ServiceContext`. `reason` is a free-text audit note.
// Messages are PT-PT.
// =============================================================================

export const bindExamSessionToGradeComponentSchema = z
  .object({
    examSessionId: z.string().min(1, "O identificador da sessão é obrigatório"),
    assessmentComponentId: z
      .string()
      .min(1, "O identificador do componente de avaliação é obrigatório"),
    reason: z.string().min(1).optional(),
  })
  .strict();
export type BindExamSessionToGradeComponentInput = z.infer<
  typeof bindExamSessionToGradeComponentSchema
>;

export const archiveExamSessionGradeComponentBindingSchema = z
  .object({
    bindingId: z.string().min(1, "O identificador da associação é obrigatório"),
    reason: z.string().min(1, "É obrigatório indicar o motivo"),
  })
  .strict();
export type ArchiveExamSessionGradeComponentBindingInput = z.infer<
  typeof archiveExamSessionGradeComponentBindingSchema
>;
