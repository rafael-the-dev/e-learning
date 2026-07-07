import { z } from "zod";
import { TranscriptDetailLevel, TranscriptType } from "@/modules/transcripts/constants";

// =============================================================================
// ACADEMIC TRANSCRIPT ENGINE — COMMAND SCHEMAS (Phase 4)
// -----------------------------------------------------------------------------
// `organizationId` and `userId` NEVER come from input — they are taken from the
// `ServiceContext`. All six transcript types are accepted by the schema; the
// Snapshot Builder decides which are implemented (unsupported ones fail fast with
// NotImplementedError, not a validation error).
// =============================================================================

export const generateTranscriptSnapshotSchema = z.object({
  studentId: z.string().min(1, "O aluno é obrigatório"),
  enrollmentId: z.string().min(1).nullish(),
  courseId: z.string().min(1).nullish(),
  transcriptType: z.enum(
    [
      TranscriptType.COURSE_TRANSCRIPT,
      TranscriptType.LEVEL_TRANSCRIPT,
      TranscriptType.SUBJECT_REPORT,
      TranscriptType.CERTIFICATE_SUPPORT,
      TranscriptType.TERM_REPORT,
      TranscriptType.FULL_ACADEMIC_HISTORY,
    ],
    { message: "Tipo de histórico inválido" }
  ),
  scopeRef: z.string().min(1).nullish(),
  detailLevel: z
    .enum([TranscriptDetailLevel.SUMMARY, TranscriptDetailLevel.DETAILED])
    .default(TranscriptDetailLevel.SUMMARY),
  /** When omitted the command stamps `new Date()`. Excluded from the checksum. */
  snapshotDate: z.date().optional(),
  reason: z.string().max(2000).nullish(),
  /** Temporary (Phase 4): when omitted the command uses `max(versionNumber)+1`. */
  versionNumber: z.number().int().positive().optional(),
});

export type GenerateTranscriptSnapshotSchema = z.infer<typeof generateTranscriptSnapshotSchema>;

// ─── Phase 5: official lifecycle ─────────────────────────────────────────────

export const issueTranscriptSchema = z.object({
  transcriptVersionId: z.string().min(1, "A versão do histórico é obrigatória"),
  reason: z.string().max(2000).nullish(),
});
export type IssueTranscriptSchema = z.infer<typeof issueTranscriptSchema>;

export const revokeTranscriptSchema = z.object({
  transcriptVersionId: z.string().min(1, "A versão do histórico é obrigatória"),
  reason: z.string().min(1, "O motivo da revogação é obrigatório").max(2000),
});
export type RevokeTranscriptSchema = z.infer<typeof revokeTranscriptSchema>;
