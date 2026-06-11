import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
  NotFoundError,
  BusinessRuleError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { findAssessmentById, updateAssessment } from "@/modules/assessments/repositories/assessment.repository";
import { upsertAssessmentResult } from "@/modules/assessments/repositories/assessment-result.repository";
import {
  upsertStudentAssessmentResult,
  findResultByEnrollmentAndComponent,
} from "@/modules/grades/repositories/student-assessment-result.repository";
import { createGradeChangeLog } from "@/modules/grades/repositories/grade-change-log.repository";
import { gradeCalculationService } from "@/modules/grades/services/grade-calculation.service";
import { RecalculateStudentSubjectProgressCommand } from "@/modules/assessments/commands/recalculate-student-subject-progress.command";
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

    // Enrollments that received a real grade — we'll recalculate progress for these.
    const recalcTargets: Array<{ studentId: string; enrollmentId: string }> = [];

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
        // Capture previous state before upserting so we can log the change.
        const existing = isRegrading
          ? await findResultByEnrollmentAndComponent(
              grade.enrollmentId,
              assessment!.assessmentComponentId,
              this.context.organizationId
            )
          : null;

        const normalizedGrade = gradeCalculationService.normalizeGrade(
          grade.score,
          assessment!.maxScore
        );

        await upsertStudentAssessmentResult({
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

        // When re-grading an already-graded assessment, log every change.
        if (existing) {
          const gradeChanged = Number(existing.grade) !== grade.score;
          const statusChanged = existing.status !== "GRADED";
          if (gradeChanged || statusChanged) {
            await createGradeChangeLog({
              organizationId: this.context.organizationId,
              studentAssessmentResultId: existing.id,
              assessmentEventId: assessment!.id,
              oldGrade: Number(existing.grade),
              newGrade: grade.score,
              oldStatus: existing.status,
              newStatus: "GRADED",
              reason: this.input.editReason!,
              changedBy: this.context.userId,
            });
          }
        }

        recalcTargets.push({ studentId: grade.studentId, enrollmentId: grade.enrollmentId });
        gradedCount++;
      }
    }

    // Auto-recalculate StudentSubjectProgress for every student who received a grade.
    // Skips validate/authorize since the parent command already cleared those.
    for (const target of recalcTargets) {
      const recalcCmd = new RecalculateStudentSubjectProgressCommand(
        {
          studentId: target.studentId,
          enrollmentId: target.enrollmentId,
          levelSubjectId: assessment!.levelSubjectId,
        },
        this.context
      );
      await recalcCmd.execute();
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
