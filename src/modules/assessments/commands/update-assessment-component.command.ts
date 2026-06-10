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
  findComponentById,
  findActiveComponentsByPolicy,
  updateAssessmentComponent,
} from "@/modules/assessments/repositories/assessment-component.repository";
import { findAssessmentPolicyById } from "@/modules/assessments/repositories/assessment-policy.repository";
import {
  updateAssessmentComponentSchema,
  type UpdateAssessmentComponentSchema,
} from "@/modules/assessments/schemas/assessment.schema";
import type { AssessmentComponent } from "@/modules/assessments/types";

export class UpdateAssessmentComponentCommand extends BaseCommand<
  UpdateAssessmentComponentSchema,
  AssessmentComponent
> {
  async validate(): Promise<void> {
    const result = updateAssessmentComponentSchema.safeParse(this.input);
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
    const component = await findComponentById(this.input.componentId, organizationId);
    if (!component) throw new NotFoundError("Componente de avaliação", this.input.componentId);

    if (this.input.weight !== undefined) {
      const policy = await findAssessmentPolicyById(component.assessmentPolicyId, organizationId);
      if (policy?.calculationMethod === "WEIGHTED_AVERAGE") {
        const others = await findActiveComponentsByPolicy(component.assessmentPolicyId, organizationId);
        const otherTotal = others
          .filter((c) => c.id !== this.input.componentId)
          .reduce((sum, c) => sum + c.weight, 0);
        if (otherTotal + this.input.weight > 100) {
          throw new ValidationError("Dados inválidos", {
            weight: [
              `O peso total excederia 100%. Disponível: ${(100 - otherTotal).toFixed(2)}%`,
            ],
          });
        }
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
    const updateData: Record<string, unknown> = {};
    if (this.input.name !== undefined) updateData.name = this.input.name;
    if (this.input.componentType !== undefined) updateData.componentType = this.input.componentType;
    if (this.input.weight !== undefined) updateData.weight = this.input.weight;
    if (this.input.order !== undefined) updateData.order = this.input.order;
    if (this.input.isRequired !== undefined) updateData.isRequired = this.input.isRequired;

    const component = await updateAssessmentComponent(
      this.input.componentId,
      this.context.organizationId,
      updateData as any
    );

    await auditService.log(this.context, {
      entity: "AssessmentComponent",
      entityId: component.id,
      action: "assessment_component.updated",
      newValues: updateData,
    });

    return component;
  }
}
