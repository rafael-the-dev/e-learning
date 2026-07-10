import { z } from "zod";

// =============================================================================
// EXAMINATION ENGINE — PHASE 9 RESULT-PUBLICATION INPUT SCHEMAS
// -----------------------------------------------------------------------------
// Zod input schemas for the exam result publication / retraction commands. Every
// schema is `.strict()` — unexpected fields are REJECTED, so a client can never
// smuggle `organizationId`, `status`, `publishedById` / `publishedAt`,
// `retractedById` / `retractedAt`, any actor id, or an individual result id: the
// publish set is derived server-side from the session's candidates + results, and
// every actor / timestamp is owned by the server `ServiceContext` / command clock.
// Publication is the SESSION-LEVEL visibility boundary (D9) — there is no
// per-student / per-result publish here. Messages are PT-PT.
//
// `reason` is a free-text note recorded in the ExamEvent / audit trail only; it is
// OPTIONAL on publish but REQUIRED on retraction (an escape-hatch always needs a
// documented motive).
// =============================================================================

export const publishExamSessionResultsSchema = z
  .object({
    examSessionId: z.string().min(1, "O identificador da sessão é obrigatório"),
    reason: z.string().min(1).optional(),
  })
  .strict();
export type PublishExamSessionResultsInput = z.infer<typeof publishExamSessionResultsSchema>;

export const retractExamSessionPublicationSchema = z
  .object({
    examSessionId: z.string().min(1, "O identificador da sessão é obrigatório"),
    publicationId: z.string().min(1).optional(),
    reason: z.string().min(1, "É obrigatório indicar o motivo"),
  })
  .strict();
export type RetractExamSessionPublicationInput = z.infer<
  typeof retractExamSessionPublicationSchema
>;
