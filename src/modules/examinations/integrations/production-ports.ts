import { BusinessRuleError } from "@/shared/lib/command";
import type { PrismaClientOrTx } from "@/server/db";
import type { AuthContext } from "@/server/auth/context";
import type {
  ExamGradeApplyInput,
  ExamGradeApplyResult,
  ExamGradeComponentResolverPort,
  ExamGradeWritePort,
  ExamProgressionConfirmInput,
  ExamProgressionConfirmPort,
  ExamProgressionConfirmResult,
} from "@/modules/examinations/commands/integration-shared";
import type { OfficialExamResultIntegrationDto } from "@/modules/examinations/services/examination-grade-integration.source";
import { resolveCanonicalAssessmentComponentForExamSession } from "@/modules/examinations/services/exam-grade-component-resolver.service";
import { findComponentById } from "@/modules/assessments/repositories/assessment-component.repository";
import {
  findResultByEnrollmentAndComponent,
  upsertStudentAssessmentResult,
} from "@/modules/grades/repositories/student-assessment-result.repository";
import { gradeCalculationService } from "@/modules/grades/services/grade-calculation.service";
import { gradeMutationService } from "@/modules/grades/services/grade-mutation.service";
import { GRADE_CHANGE_SOURCE } from "@/modules/grades/types";
import type { ServiceContext } from "@/shared/types/common";

// =============================================================================
// EXAMINATION ENGINE — PRODUCTION INTEGRATION PORTS (Phase 11B; LIVE adapter seam)
// -----------------------------------------------------------------------------
// The SANCTIONED adapter seam for the Grade/Progression integration boundary (E-13).
// This is the ONLY place a real Grade/Progression adapter is wired, keeping that
// coupling isolated from the command + pure layers. It NEVER touches the Transcript
// or Certificate engines.
//
// LIVE since Phase 11B / ADR-014: the exam→grade-component link IS now modeled by the
// explicit `ExamGradeComponentBinding` (per session, one active mapping to a Grade
// `assessmentComponentId`). The resolver returns the bound component (or `null` when a
// session is UNBOUND, keeping integration honestly UNSUPPORTED) — there is NO heuristic
// fallback. When a binding exists, the grade port performs the REAL canonical write
// through `upsertStudentAssessmentResult` + `gradeMutationService.handleGradeMutation`
// (the single grade writer; it cascades subject→level→course progression), and the
// progression port CONFIRMS the resulting `StudentSubjectProgress` status (it does NOT
// re-run the cascade, to avoid a double cascade). Grade-side idempotency is the
// natural-key upsert `(enrollmentId, assessmentComponentId)`; the exam side additionally
// tracks `officialVersion` staleness via the append-only ExamEvent ledger (Phase 11).
//
// A SCORED result whose exam `maxScore` cannot be faithfully represented against the
// bound component's `maxGrade` throws `EXAM_RESULT_INTEGRATION_UNSUPPORTED` — it is
// NEVER rescale-guessed. Non-scored outcomes never reach here (the command maps them to
// UNSUPPORTED before the port). Actor ids come from the command's ServiceContext only.
// =============================================================================

/** Production resolver: the exam session's single active binding (ADR-014). Returns
 *  `null` when the session is unbound OR its `examSessionId` is unresolved (→ the
 *  command returns EXAM_RESULT_INTEGRATION_UNSUPPORTED). NO heuristic. */
export const productionComponentResolver: ExamGradeComponentResolverPort = {
  async resolve(
    dto: OfficialExamResultIntegrationDto,
    client?: PrismaClientOrTx
  ): Promise<{ assessmentComponentId: string; subjectId: string } | null> {
    if (!dto.examSessionId) return null;
    const resolved = await resolveCanonicalAssessmentComponentForExamSession(
      {
        organizationId: dto.organizationId,
        examSessionId: dto.examSessionId,
        levelSubjectId: dto.levelSubjectId,
      },
      client
    );
    if (!resolved) return null;
    return {
      assessmentComponentId: resolved.assessmentComponentId,
      subjectId: resolved.subjectId,
    };
  },
};

/** Production grade writer: the REAL canonical grade write (single grade writer),
 *  replicating BulkGradeAssessmentCommand's math and call shape 1:1. */
export const productionGradeWritePort: ExamGradeWritePort = {
  async apply(
    input: ExamGradeApplyInput,
    context: ServiceContext,
    client: PrismaClientOrTx
  ): Promise<ExamGradeApplyResult> {
    // The bound component supplies the canonical maxGrade. Its scale MUST match the
    // exam's maxScore (input.maxGrade) — otherwise the exam score cannot be faithfully
    // represented against the component and we refuse (never rescale-guess).
    const component = await findComponentById(input.assessmentComponentId, input.organizationId);
    if (!component) {
      throw new BusinessRuleError("EXAM_RESULT_INTEGRATION_UNSUPPORTED", {
        reason: "assessment component not found",
        assessmentComponentId: input.assessmentComponentId,
      });
    }
    if (component.maxGrade !== input.maxGrade) {
      throw new BusinessRuleError("EXAM_RESULT_INTEGRATION_UNSUPPORTED", {
        reason: "exam maxScore does not match the bound component maxGrade",
        examMaxScore: input.maxGrade,
        componentMaxGrade: component.maxGrade,
      });
    }

    // Replicate BulkGradeAssessmentCommand: grade = score, maxGrade = component maxGrade,
    // normalizedGrade = gradeCalculationService.normalizeGrade(score, maxGrade).
    const grade = input.grade;
    const maxGrade = component.maxGrade;
    const normalizedGrade = gradeCalculationService.normalizeGrade(grade, maxGrade);

    // Capture prior state for an accurate change-log previous snapshot.
    const previous = await findResultByEnrollmentAndComponent(
      input.enrollmentId,
      input.assessmentComponentId,
      input.organizationId,
      client
    );

    const result = await upsertStudentAssessmentResult(
      {
        organizationId: input.organizationId,
        enrollmentId: input.enrollmentId,
        studentId: input.studentId,
        levelSubjectId: input.levelSubjectId,
        subjectId: input.subjectId,
        assessmentComponentId: input.assessmentComponentId,
        sourceType: "SCHEDULED_EVENT",
        grade,
        maxGrade,
        normalizedGrade,
        status: "GRADED",
        gradedBy: input.actorId,
        gradedAt: new Date(),
      },
      client
    );

    // Route through the single canonical mutation path: writes the GradeChangeLog and
    // cascades subject → level → course progression. `events: []` — the exam boundary
    // has no domain-event bus, so the cascade's events are collected and discarded.
    await gradeMutationService.handleGradeMutation(context as AuthContext, {
      result,
      previous: previous
        ? { grade: previous.grade, normalizedGrade: previous.normalizedGrade, status: previous.status }
        : null,
      source: GRADE_CHANGE_SOURCE.EXAMINATION,
      reason: input.reason,
      client,
      events: [],
    });

    return {
      gradeRecordId: result.id,
      action: previous ? "UPDATED" : "CREATED",
      progressionStatus: null,
    };
  },
};

/** Production progression confirmer: the canonical grade mutation ALREADY cascaded
 *  progression, so this CONFIRMS the resulting StudentSubjectProgress status via a
 *  tenant-scoped, tx-aware READ (never a re-run — that would double-cascade). */
export const productionProgressionConfirmPort: ExamProgressionConfirmPort = {
  async confirm(
    input: ExamProgressionConfirmInput,
    context: ServiceContext,
    client: PrismaClientOrTx
  ): Promise<ExamProgressionConfirmResult> {
    // Read the cascaded row on the SAME tx client so the just-written progress is
    // visible. This is a READ only — the cascade (single owner) performed the write.
    const row = await client.studentSubjectProgress.findFirst({
      where: {
        organizationId: context.organizationId,
        enrollmentId: input.enrollmentId,
        levelSubjectId: input.levelSubjectId,
      },
      select: { status: true },
    });
    return { recalculated: true, status: (row?.status as string | undefined) ?? null };
  },
};
