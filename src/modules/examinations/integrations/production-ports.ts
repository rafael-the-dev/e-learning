import { BusinessRuleError } from "@/shared/lib/command";
import type {
  ExamGradeComponentResolverPort,
  ExamGradeWritePort,
  ExamProgressionConfirmPort,
} from "@/modules/examinations/commands/integration-shared";

// =============================================================================
// EXAMINATION ENGINE — PRODUCTION INTEGRATION PORTS (Phase 11; adapter seam)
// -----------------------------------------------------------------------------
// The SANCTIONED adapter seam for the Grade/Progression integration boundary (E-13).
// This is the ONLY place a real Grade/Progression adapter would be wired, keeping that
// coupling isolated from the command + pure layers. It NEVER touches the Transcript or
// Certificate engines.
//
// DOCUMENTED GAP (why the write path is dormant today):
//   The exam→grade-component link is NOT modeled. An ExamResult keys on `levelSubjectId`,
//   but the Grade Engine keys grades on `assessmentComponentId`; there is no mapping from
//   an exam result to the assessment component a grade must be written against. Until a
//   future schema link + ADR lands (option A: an explicit ExamResult→AssessmentComponent
//   mapping), the production component resolver returns `null`, so the integration command
//   honestly returns EXAM_RESULT_INTEGRATION_UNSUPPORTED and NO grade / progression write
//   ever happens in production. Tests inject FAKE ports to exercise the full write path.
//
// Because the resolver gates every production run out BEFORE the grade / progression ports
// are reached, those two ports are unreachable in production today. Rather than wire a real
// grade write against a semantically-wrong change-source (the Grade Engine's
// `GradeChangeSource` union has no EXAMINATION member) or a progression read that cannot
// see the current transaction's uncommitted cascade, they fail fast with a clear
// UNSUPPORTED business error. When the schema link lands, the real bodies replace these:
//   • gradePort → upsertStudentAssessmentResult({ sourceType: "SCHEDULED_EVENT",
//     status: "GRADED", gradedBy, gradedAt }, client) then
//     gradeMutationService.handleGradeMutation(context, { result, previous, source, reason,
//     client, events: [] }) — which cascades progression.
//   • progressionPort → CONFIRM the resulting StudentSubjectProgress status (NOT a re-run,
//     to avoid a double cascade).
// =============================================================================

/** Production resolver: no exam→component mapping exists yet → always `null`
 *  (documented gap). This is what gates every production integration to UNSUPPORTED. */
export const productionComponentResolver: ExamGradeComponentResolverPort = {
  async resolve(): Promise<{ assessmentComponentId: string; subjectId: string } | null> {
    return null;
  },
};

/** Production grade writer. Dormant until the exam→component link lands; unreachable in
 *  production today because the resolver returns `null` first. */
export const productionGradeWritePort: ExamGradeWritePort = {
  async apply() {
    throw new BusinessRuleError("EXAM_RESULT_INTEGRATION_UNSUPPORTED", {
      reason: "grade wiring pending exam→component link",
    });
  },
};

/** Production progression confirmer. Dormant for the same reason as the grade writer. */
export const productionProgressionConfirmPort: ExamProgressionConfirmPort = {
  async confirm() {
    throw new BusinessRuleError("EXAM_RESULT_INTEGRATION_UNSUPPORTED", {
      reason: "progression confirmation pending exam→component link",
    });
  },
};
