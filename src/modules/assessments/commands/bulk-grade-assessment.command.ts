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
import { findAssessmentById, updateAssessment } from "@/modules/assessments/repositories/assessment.repository";
import { upsertAssessmentResult } from "@/modules/assessments/repositories/assessment-result.repository";
import {
  upsertStudentAssessmentResult,
  findResultByEnrollmentAndComponent,
} from "@/modules/grades/repositories/student-assessment-result.repository";
import { gradeCalculationService } from "@/modules/grades/services/grade-calculation.service";
import { gradeMutationService } from "@/modules/grades/services/grade-mutation.service";
import { GRADE_CHANGE_SOURCE } from "@/modules/grades/types";
import {
  bulkGradeAssessmentSchema,
  type BulkGradeAssessmentSchema,
} from "@/modules/assessments/schemas/assessment.schema";
import type { AssessmentResult } from "@/modules/assessments/types";

export class BulkGradeAssessmentCommand extends BaseCommand<
  BulkGradeAssessmentSchema,
  AssessmentResult[]
> {
  async validate(): Promise<void> {
    const result = bulkGradeAssessmentSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const assessment = await findAssessmentById(this.input.assessmentId, this.context.organizationId);
    if (!assessment) throw new NotFoundError("Avaliação", this.input.assessmentId);

    if (assessment.status === "CANCELLED" || assessment.status === "ARCHIVED") {
      throw new BusinessRuleError("Não é possível classificar uma avaliação cancelada ou arquivada.");
    }

    if (assessment.status === "LOCKED") {
      throw new BusinessRuleError(
        "Esta avaliação está bloqueada. Apenas um administrador pode desbloqueá-la."
      );
    }

    // Editing a GRADED assessment requires a reason
    if (assessment.status === "GRADED" && !this.input.editReason?.trim()) {
      throw new ValidationError("Dados inválidos", {
        editReason: ["O motivo da alteração é obrigatório para reclassificar uma avaliação já classificada."],
      });
    }

    for (const grade of this.input.grades) {
      if (grade.score !== null && grade.score > assessment.maxScore) {
        throw new ValidationError("Dados inválidos", {
          grades: [`Pontuação ${grade.score} excede o máximo de ${assessment.maxScore}`],
        });
      }
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    const ability = createAbility(perms);

    if (!ability.can(PERMISSIONS.ASSESSMENT_RESULTS_GRADE)) {
      throw new AuthorizationError();
    }

    // Defense-in-depth against write IDOR: a teacher-scoped user may only grade
    // an assessment they own (or for a class group they teach). No-op for
    // admins/secretaries. See docs/teacher-access-scope.md.
    await assertTeacherCanAccessAssessment(this.context as AuthContext, this.input.assessmentId);

    // Editing a GRADED assessment requires GRADES_UPDATE on top of grade permission
    const assessment = await findAssessmentById(this.input.assessmentId, this.context.organizationId);
    if (assessment?.status === "GRADED" && !ability.can(PERMISSIONS.GRADES_UPDATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<AssessmentResult[]> {
    const assessment = await findAssessmentById(this.input.assessmentId, this.context.organizationId)!;
    const results: AssessmentResult[] = [];
    const now = new Date();
    const isRegrading = assessment!.status === "GRADED";
    let gradedCount = 0;

    // Reason recorded on every bulk GradeChangeLog. editReason is required by
    // validate() when regrading; first-time grading falls back to a default.
    const bulkReason = this.input.editReason?.trim() || "Classificação em lote";

    for (const grade of this.input.grades) {
      const resultStatus =
        grade.status === "MISSING" ? "MISSING" :
        grade.status === "EXCUSED" ? "EXCUSED" :
        "GRADED";

      // AssessmentResult tracks event participation (status, feedback) only.
      // Grade values are not stored here — StudentAssessmentResult is the canonical source.
      const result = await upsertAssessmentResult({
        organizationId: this.context.organizationId,
        assessmentId: this.input.assessmentId,
        studentId: grade.studentId,
        enrollmentId: grade.enrollmentId ?? null,
        score: null,
        normalizedScore: null,
        feedback: grade.feedback ?? null,
        status: resultStatus,
        gradedByUserId: this.context.userId,
        gradedAt: now,
      });

      results.push(result);

      // Write canonical grade to StudentAssessmentResult (single source of truth).
      if (
        grade.enrollmentId &&
        grade.score !== null &&
        resultStatus === "GRADED" &&
        assessment!.levelSubjectId &&
        assessment!.subjectId
      ) {
        // Capture prior state before upserting so the mutation is logged with an
        // accurate previous snapshot (first-time -> null) and no-op edits skip the log.
        const existing = await findResultByEnrollmentAndComponent(
          grade.enrollmentId,
          assessment!.assessmentComponentId,
          this.context.organizationId
        );

        const normalizedGrade = gradeCalculationService.normalizeGrade(
          grade.score,
          assessment!.maxScore
        );

        const canonical = await upsertStudentAssessmentResult({
          organizationId: this.context.organizationId,
          enrollmentId: grade.enrollmentId,
          studentId: grade.studentId,
          levelSubjectId: assessment!.levelSubjectId,
          subjectId: assessment!.subjectId,
          assessmentComponentId: assessment!.assessmentComponentId,
          assessmentEventId: assessment!.id,
          sourceType: "SCHEDULED_EVENT",
          grade: grade.score,
          maxGrade: assessment!.maxScore,
          normalizedGrade,
          status: "GRADED",
          gradedBy: this.context.userId,
          gradedAt: now,
        });

        // Only skip the audit entry when a regrade changed nothing at all.
        const changed =
          !existing ||
          canonical.grade !== existing.grade ||
          canonical.normalizedGrade !== existing.normalizedGrade ||
          existing.status !== "GRADED";

        // Route through the single canonical mutation path: writes the
        // GradeChangeLog (source = BULK, previous = existing snapshot or null for
        // first-time grading) and cascades subject -> level -> course.
        await gradeMutationService.handleGradeMutation(this.context as AuthContext, {
          result: canonical,
          previous: existing
            ? { grade: existing.grade, normalizedGrade: existing.normalizedGrade, status: existing.status }
            : null,
          source: GRADE_CHANGE_SOURCE.BULK,
          reason: bulkReason,
          logChange: changed,
        });

        gradedCount++;
      }
    }

    // Mark assessment as GRADED when every submitted entry has a terminal status.
    const gradedStatuses = ["GRADED", "MISSING", "EXCUSED", "INVALIDATED"];
    const allGraded = this.input.grades.every((g) => gradedStatuses.includes(g.status));
    if (allGraded && assessment!.status !== "GRADED") {
      await updateAssessment(this.input.assessmentId, this.context.organizationId, {
        status: "GRADED",
      });
    }

    await auditService.log(this.context, {
      entity: "Assessment",
      entityId: this.input.assessmentId,
      action: isRegrading ? "assessment_result.regraded" : "assessment_result.graded",
      newValues: {
        assessmentId: this.input.assessmentId,
        totalSubmitted: results.length,
        gradedCount,
        ...(isRegrading && { editReason: this.input.editReason }),
      },
    });

    return results;
  }
}
