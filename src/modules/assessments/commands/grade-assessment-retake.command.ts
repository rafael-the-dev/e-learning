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
import {
  findRetakeById,
  updateAssessmentRetake,
} from "@/modules/assessments/repositories/assessment-retake.repository";
import { findAssessmentById } from "@/modules/assessments/repositories/assessment.repository";
import { gradeCalculatorService } from "@/modules/assessments/services/grade-calculator.service";
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
  }

  async execute(): Promise<AssessmentRetake> {
    const retake = (await findRetakeById(this.input.retakeId, this.context.organizationId))!;
    const assessment = await findAssessmentById(retake.assessmentId, this.context.organizationId);

    const normalizedScore = assessment
      ? gradeCalculatorService.calculateNormalizedScore(this.input.score, assessment.maxScore)
      : null;

    const updated = await updateAssessmentRetake(this.input.retakeId, this.context.organizationId, {
      score: this.input.score,
      normalizedScore,
      status: "GRADED",
      gradedAt: new Date(),
    });

    await auditService.log(this.context, {
      entity: "AssessmentRetake",
      entityId: retake.id,
      action: "assessment_retake.graded",
      newValues: { score: this.input.score, normalizedScore },
    });

    return updated;
  }
}
