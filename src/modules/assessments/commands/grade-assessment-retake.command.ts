import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
  NotFoundError,
  BusinessRuleError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { assertTeacherCanAccessAssessment } from "@/server/auth/teacher-access";
import type { AuthContext } from "@/server/auth/context";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findRetakeById,
  updateAssessmentRetake,
} from "@/modules/assessments/repositories/assessment-retake.repository";
import { findAssessmentById } from "@/modules/assessments/repositories/assessment.repository";
import { findResultById as findAssessmentResultById } from "@/modules/assessments/repositories/assessment-result.repository";
import {
  findResultByEnrollmentAndComponent,
  upsertStudentAssessmentResult,
} from "@/modules/grades/repositories/student-assessment-result.repository";
import { gradeCalculationService } from "@/modules/grades/services/grade-calculation.service";
import { gradeMutationService } from "@/modules/grades/services/grade-mutation.service";
import { gradeResolutionEngine } from "@/modules/grades/engines/grade-resolution.engine";
import { GRADE_CHANGE_SOURCE, SOURCE_TYPE } from "@/modules/grades/types";
import {
  gradeAssessmentRetakeSchema,
  type GradeAssessmentRetakeSchema,
} from "@/modules/assessments/schemas/assessment.schema";
import type { AssessmentRetake } from "@/modules/assessments/types";

export class GradeAssessmentRetakeCommand extends BaseCommand<
  GradeAssessmentRetakeSchema,
  AssessmentRetake
> {
  async validate(): Promise<void> {
    const result = gradeAssessmentRetakeSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const { organizationId } = this.context;
    const retake = await findRetakeById(this.input.retakeId, organizationId);
    if (!retake) throw new NotFoundError("Recuperação", this.input.retakeId);
    if (retake.status !== "APPROVED") {
      throw new BusinessRuleError("Apenas recuperações aprovadas podem ser classificadas.");
    }

    const assessment = await findAssessmentById(retake.assessmentId, organizationId);
    if (assessment && this.input.score > assessment.maxScore) {
      throw new ValidationError("Dados inválidos", {
        score: [`A pontuação excede o máximo de ${assessment.maxScore}`],
      });
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ASSESSMENT_RESULTS_GRADE)) {
      throw new AuthorizationError();
    }
    // Defense-in-depth against write IDOR: a teacher-scoped user may only grade a
    // retake of an assessment they own (or for a class group they teach). The
    // retake exists here (validate() ran first and asserts it).
    const retake = await findRetakeById(this.input.retakeId, this.context.organizationId);
    if (retake) {
      await assertTeacherCanAccessAssessment(this.context as AuthContext, retake.assessmentId);
    }
  }

  async execute(): Promise<AssessmentRetake> {
    const { organizationId } = this.context;
    const retake = (await findRetakeById(this.input.retakeId, organizationId))!;
    const assessment = await findAssessmentById(retake.assessmentId, organizationId);
    const now = new Date();

    // Normalization is unified through GradeCalculationService (no legacy calculator).
    const normalizedScore = assessment
      ? gradeCalculationService.normalizeGrade(this.input.score, assessment.maxScore)
      : null;

    const updated = await updateAssessmentRetake(this.input.retakeId, organizationId, {
      score: this.input.score,
      normalizedScore,
      status: "GRADED",
      gradedAt: now,
    });

    await auditService.log(this.context, {
      entity: "AssessmentRetake",
      entityId: retake.id,
      action: "assessment_retake.graded",
      newValues: { score: this.input.score, normalizedScore },
    });

    // ── Recovery write-back ─────────────────────────────────────────────────
    // A graded retake must update the canonical grade so the academic outcome
    // reflects the recovery. Resolve the effective grade, write it as a
    // RECOVERY-sourced StudentAssessmentResult, then cascade progression.
    if (!assessment?.levelSubjectId || !assessment.subjectId || !assessment.assessmentComponentId) {
      return updated;
    }

    // Enrollment: prefer the retake's own link, fall back to the original result.
    let enrollmentId = retake.enrollmentId ?? null;
    if (!enrollmentId) {
      const originalResult = await findAssessmentResultById(
        retake.originalAssessmentResultId,
        organizationId
      );
      enrollmentId = originalResult?.enrollmentId ?? null;
    }
    if (!enrollmentId) return updated;

    const existing = await findResultByEnrollmentAndComponent(
      enrollmentId,
      assessment.assessmentComponentId,
      organizationId
    );

    // Decide how the recovery grade combines with the original (default BEST_SCORE).
    const resolution = gradeResolutionEngine.resolve({
      originalGrade: existing ? existing.grade : null,
      recoveryGrade: this.input.score,
    });

    const effectiveGrade = resolution.effectiveGrade;
    const normalizedEffective = gradeCalculationService.normalizeGrade(
      effectiveGrade,
      assessment.maxScore
    );

    const canonical = await upsertStudentAssessmentResult({
      organizationId,
      enrollmentId,
      studentId: retake.studentId,
      levelSubjectId: assessment.levelSubjectId,
      subjectId: assessment.subjectId,
      assessmentComponentId: assessment.assessmentComponentId,
      assessmentEventId: assessment.id,
      sourceType: SOURCE_TYPE.RECOVERY,
      grade: effectiveGrade,
      maxGrade: assessment.maxScore,
      normalizedGrade: normalizedEffective,
      status: "GRADED",
      gradedBy: this.context.userId,
      gradedAt: now,
    });

    await gradeMutationService.handleGradeMutation(this.context as AuthContext, {
      result: canonical,
      previous: existing
        ? { grade: existing.grade, normalizedGrade: existing.normalizedGrade, status: existing.status }
        : null,
      source: GRADE_CHANGE_SOURCE.RECOVERY,
      reason: `Recuperação classificada (${resolution.reason})`,
    });

    return updated;
  }
}
