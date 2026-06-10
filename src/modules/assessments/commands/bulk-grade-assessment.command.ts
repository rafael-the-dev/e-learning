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
import { gradeCalculatorService } from "@/modules/assessments/services/grade-calculator.service";
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
    if (!createAbility(perms).can(PERMISSIONS.ASSESSMENT_RESULTS_GRADE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<AssessmentResult[]> {
    const assessment = await findAssessmentById(this.input.assessmentId, this.context.organizationId)!;
    const results: AssessmentResult[] = [];
    const now = new Date();

    for (const grade of this.input.grades) {
      let normalizedScore: number | null = null;
      if (grade.score !== null && assessment!.maxScore > 0) {
        normalizedScore = gradeCalculatorService.calculateNormalizedScore(
          grade.score,
          assessment!.maxScore
        );
      }

      const resultStatus =
        grade.status === "MISSING" ? "MISSING" :
        grade.status === "EXCUSED" ? "EXCUSED" :
        "GRADED";

      const result = await upsertAssessmentResult({
        organizationId: this.context.organizationId,
        assessmentId: this.input.assessmentId,
        studentId: grade.studentId,
        enrollmentId: grade.enrollmentId ?? null,
        score: grade.score,
        normalizedScore,
        feedback: grade.feedback ?? null,
        status: resultStatus,
        gradedByUserId: this.context.userId,
        gradedAt: now,
      });

      results.push(result);
    }

    // Mark assessment as GRADED if all entries have been processed
    const gradedStatuses = ["GRADED", "MISSING", "EXCUSED", "INVALIDATED"];
    const allGraded = this.input.grades.every((g) =>
      gradedStatuses.includes(g.status)
    );
    if (allGraded) {
      await updateAssessment(this.input.assessmentId, this.context.organizationId, {
        status: "GRADED",
      });
    }

    await auditService.log(this.context, {
      entity: "Assessment",
      entityId: this.input.assessmentId,
      action: "assessment_result.graded",
      newValues: { count: results.length, assessmentId: this.input.assessmentId },
    });

    return results;
  }
}
