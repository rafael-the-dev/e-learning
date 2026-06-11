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
  updateSubjectPolicySchema,
  type UpdateSubjectPolicySchema,
} from "@/modules/grades/schemas/grade.schema";
import type { AssessmentPolicy } from "@/modules/assessments/types";

export class UpdateAssessmentPolicyCommand extends BaseCommand<
  UpdateSubjectPolicySchema,
  AssessmentPolicy
> {
  async validate(): Promise<void> {
    const result = updateSubjectPolicySchema.safeParse(this.input);
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
    if (!createAbility(perms).can(PERMISSIONS.GRADE_POLICIES_UPDATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<AssessmentPolicy> {
    const { policyId, ...updates } = this.input;
    const oldPolicy = await findAssessmentPolicyById(policyId, this.context.organizationId);

    const policy = await updateAssessmentPolicy(policyId, this.context.organizationId, updates);

    await auditService.log(this.context, {
      entity: "AssessmentPolicy",
      entityId: policy.id,
      action: "assessment_policy.updated",
      oldValues: { name: oldPolicy?.name, status: oldPolicy?.status },
      newValues: { name: policy.name, status: policy.status },
    });

    return policy;
  }
}
