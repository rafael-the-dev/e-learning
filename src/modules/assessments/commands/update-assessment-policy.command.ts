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
  findAssessmentPolicyById,
  updateAssessmentPolicy,
} from "@/modules/assessments/repositories/assessment-policy.repository";
import {
  updateAssessmentPolicySchema,
  type UpdateAssessmentPolicySchema,
} from "@/modules/assessments/schemas/assessment.schema";
import type { AssessmentPolicy } from "@/modules/assessments/types";

export class UpdateAssessmentPolicyCommand extends BaseCommand<
  UpdateAssessmentPolicySchema,
  AssessmentPolicy
> {
  async validate(): Promise<void> {
    const result = updateAssessmentPolicySchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const policy = await findAssessmentPolicyById(this.input.policyId, this.context.organizationId);
    if (!policy) throw new NotFoundError("Política de avaliação", this.input.policyId);
    if (policy.status === "ARCHIVED") {
      throw new ValidationError("Dados inválidos", {
        policyId: ["Não é possível editar uma política arquivada"],
      });
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ASSESSMENT_POLICIES_UPDATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<AssessmentPolicy> {
    const updateData: Record<string, unknown> = {};
    if (this.input.name !== undefined) updateData.name = this.input.name;
    if (this.input.description !== undefined) updateData.description = this.input.description;
    if (this.input.calculationMethod !== undefined) updateData.calculationMethod = this.input.calculationMethod;
    if (this.input.roundingMethod !== undefined) updateData.roundingMethod = this.input.roundingMethod;
    if (this.input.minimumPassingGrade !== undefined) updateData.minimumPassingGrade = this.input.minimumPassingGrade;
    if (this.input.allowRetake !== undefined) updateData.allowRetake = this.input.allowRetake;
    if (this.input.maxRetakes !== undefined) updateData.maxRetakes = this.input.maxRetakes;

    const policy = await updateAssessmentPolicy(
      this.input.policyId,
      this.context.organizationId,
      updateData as any
    );

    await auditService.log(this.context, {
      entity: "AssessmentPolicy",
      entityId: policy.id,
      action: "assessment_policy.updated",
      newValues: updateData,
    });

    return policy;
  }
}
