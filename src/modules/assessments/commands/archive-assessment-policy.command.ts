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
  archiveAssessmentPolicySchema,
  type ArchiveAssessmentPolicySchema,
} from "@/modules/assessments/schemas/assessment.schema";

export class ArchiveAssessmentPolicyCommand extends BaseCommand<ArchiveAssessmentPolicySchema, void> {
  async validate(): Promise<void> {
    const result = archiveAssessmentPolicySchema.safeParse(this.input);
    if (!result.success) throw new ValidationError("Dados inválidos");

    const policy = await findAssessmentPolicyById(this.input.policyId, this.context.organizationId);
    if (!policy) throw new NotFoundError("Política de avaliação", this.input.policyId);
    if (policy.status === "ARCHIVED") {
      throw new ValidationError("Dados inválidos", {
        policyId: ["A política já está arquivada"],
      });
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ASSESSMENT_POLICIES_ARCHIVE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await updateAssessmentPolicy(this.input.policyId, this.context.organizationId, {
      status: "ARCHIVED",
    });

    await auditService.log(this.context, {
      entity: "AssessmentPolicy",
      entityId: this.input.policyId,
      action: "assessment_policy.archived",
    });
  }
}
