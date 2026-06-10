import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
  NotFoundError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findResultById,
  updateAssessmentResult,
} from "@/modules/assessments/repositories/assessment-result.repository";
import {
  invalidateAssessmentResultSchema,
  type InvalidateAssessmentResultSchema,
} from "@/modules/assessments/schemas/assessment.schema";

export class InvalidateAssessmentResultCommand extends BaseCommand<
  InvalidateAssessmentResultSchema,
  void
> {
  async validate(): Promise<void> {
    const result = invalidateAssessmentResultSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const assessmentResult = await findResultById(this.input.resultId, this.context.organizationId);
    if (!assessmentResult) throw new NotFoundError("Resultado de avaliação", this.input.resultId);
    if (assessmentResult.status === "INVALIDATED") {
      throw new ValidationError("Dados inválidos", {
        resultId: ["O resultado já está invalidado"],
      });
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ASSESSMENT_RESULTS_INVALIDATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await updateAssessmentResult(this.input.resultId, this.context.organizationId, {
      status: "INVALIDATED",
      feedback: this.input.reason,
    });

    await auditService.log(this.context, {
      entity: "AssessmentResult",
      entityId: this.input.resultId,
      action: "assessment_result.invalidated",
      newValues: { reason: this.input.reason },
    });
  }
}
