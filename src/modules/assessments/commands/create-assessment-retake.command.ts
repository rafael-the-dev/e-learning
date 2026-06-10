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
import { findResultById } from "@/modules/assessments/repositories/assessment-result.repository";
import { findAssessmentById } from "@/modules/assessments/repositories/assessment.repository";
import { findAssessmentPolicyById } from "@/modules/assessments/repositories/assessment-policy.repository";
import {
  createAssessmentRetake,
  countApprovedRetakesByResult,
} from "@/modules/assessments/repositories/assessment-retake.repository";
import {
  createAssessmentRetakeSchema,
  type CreateAssessmentRetakeSchema,
} from "@/modules/assessments/schemas/assessment.schema";
import type { AssessmentRetake } from "@/modules/assessments/types";

export class CreateAssessmentRetakeCommand extends BaseCommand<
  CreateAssessmentRetakeSchema,
  AssessmentRetake
> {
  async validate(): Promise<void> {
    const result = createAssessmentRetakeSchema.safeParse(this.input);
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

    const originalResult = await findResultById(this.input.originalAssessmentResultId, organizationId);
    if (!originalResult) throw new NotFoundError("Resultado de avaliação", this.input.originalAssessmentResultId);
    if (!["GRADED", "MISSING"].includes(originalResult.status)) {
      throw new BusinessRuleError("Apenas resultados classificados ou em falta podem ter recuperação.");
    }

    const assessment = await findAssessmentById(this.input.assessmentId, organizationId);
    if (!assessment) throw new NotFoundError("Avaliação", this.input.assessmentId);

    const policy = await findAssessmentPolicyById(assessment.assessmentPolicyId, organizationId);
    if (!policy) throw new NotFoundError("Política de avaliação", assessment.assessmentPolicyId);
    if (!policy.allowRetake) {
      throw new BusinessRuleError("A política de avaliação não permite recuperações.");
    }

    const usedRetakes = await countApprovedRetakesByResult(
      this.input.originalAssessmentResultId,
      organizationId
    );
    if (usedRetakes >= policy.maxRetakes) {
      throw new BusinessRuleError(
        `Número máximo de recuperações atingido (${policy.maxRetakes}).`
      );
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ASSESSMENTS_CREATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<AssessmentRetake> {
    const usedRetakes = await countApprovedRetakesByResult(
      this.input.originalAssessmentResultId,
      this.context.organizationId
    );

    const retake = await createAssessmentRetake({
      organizationId: this.context.organizationId,
      originalAssessmentResultId: this.input.originalAssessmentResultId,
      assessmentId: this.input.assessmentId,
      studentId: this.input.studentId,
      enrollmentId: this.input.enrollmentId ?? null,
      attemptNumber: usedRetakes + 1,
    });

    await auditService.log(this.context, {
      entity: "AssessmentRetake",
      entityId: retake.id,
      action: "assessment_retake.requested",
      newValues: {
        studentId: retake.studentId,
        assessmentId: retake.assessmentId,
        attemptNumber: retake.attemptNumber,
      },
    });

    return retake;
  }
}
