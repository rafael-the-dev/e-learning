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
  findAssessmentPolicyById,
} from "@/modules/assessments/repositories/assessment-policy.repository";
import {
  findActiveComponentsByPolicy,
  createAssessmentComponent,
} from "@/modules/assessments/repositories/assessment-component.repository";
import {
  createAssessmentComponentSchema,
  type CreateAssessmentComponentSchema,
} from "@/modules/assessments/schemas/assessment.schema";
import type { AssessmentComponent } from "@/modules/assessments/types";

export class CreateAssessmentComponentCommand extends BaseCommand<
  CreateAssessmentComponentSchema,
  AssessmentComponent
> {
  async validate(): Promise<void> {
    const result = createAssessmentComponentSchema.safeParse(this.input);
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
    const policy = await findAssessmentPolicyById(this.input.assessmentPolicyId, organizationId);
    if (!policy) throw new NotFoundError("Política de avaliação", this.input.assessmentPolicyId);
    if (policy.status === "ARCHIVED") {
      throw new BusinessRuleError("Não é possível adicionar componentes a uma política arquivada.");
    }

    // For WEIGHTED_AVERAGE: verify total weight won't exceed 100
    if (policy.calculationMethod === "WEIGHTED_AVERAGE") {
      const existing = await findActiveComponentsByPolicy(this.input.assessmentPolicyId, organizationId);
      const currentTotal = existing.reduce((sum, c) => sum + c.weight, 0);
      if (currentTotal + this.input.weight > 100) {
        throw new ValidationError("Dados inválidos", {
          weight: [
            `O peso total dos componentes excederia 100%. Disponível: ${(100 - currentTotal).toFixed(2)}%`,
          ],
        });
      }
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ASSESSMENT_COMPONENTS_MANAGE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<AssessmentComponent> {
    const component = await createAssessmentComponent({
      organizationId: this.context.organizationId,
      assessmentPolicyId: this.input.assessmentPolicyId,
      name: this.input.name,
      componentType: this.input.componentType,
      weight: this.input.weight,
      maxGrade: 20,
      order: this.input.order,
      isRequired: this.input.isRequired,
    });

    await auditService.log(this.context, {
      entity: "AssessmentComponent",
      entityId: component.id,
      action: "assessment_component.created",
      newValues: {
        assessmentPolicyId: component.assessmentPolicyId,
        name: component.name,
        componentType: component.componentType,
        weight: component.weight,
      },
    });

    return component;
  }
}
