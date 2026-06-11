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
  findActivePolicyForLevelSubject,
  updateAssessmentPolicy,
} from "@/modules/assessments/repositories/assessment-policy.repository";
import { findActiveComponentsByPolicy } from "@/modules/assessments/repositories/assessment-component.repository";
import {
  activateSubjectPolicySchema,
  type ActivateSubjectPolicySchema,
} from "@/modules/grades/schemas/grade.schema";
import type { AssessmentPolicy } from "@/modules/assessments/types";

export class ActivateAssessmentPolicyCommand extends BaseCommand<
  ActivateSubjectPolicySchema,
  AssessmentPolicy
> {
  async validate(): Promise<void> {
    const result = activateSubjectPolicySchema.safeParse(this.input);
    if (!result.success) throw new ValidationError("Dados inválidos");

    const policy = await findAssessmentPolicyById(this.input.policyId, this.context.organizationId);
    if (!policy) throw new NotFoundError("Política de avaliação", this.input.policyId);
    if (policy.status === "ACTIVE") {
      throw new ValidationError("Dados inválidos", { policyId: ["A política já está ativa"] });
    }
    if (policy.status === "ARCHIVED") {
      throw new ValidationError("Dados inválidos", { policyId: ["Não é possível ativar uma política arquivada"] });
    }

    const existing = await findActivePolicyForLevelSubject(
      policy.levelSubjectId,
      this.context.organizationId
    );
    if (existing && existing.id !== policy.id) {
      throw new BusinessRuleError(
        "Já existe uma política ativa para esta configuração de disciplina. Archive-a primeiro."
      );
    }

    const components = await findActiveComponentsByPolicy(policy.id, this.context.organizationId);
    if (components.length === 0) {
      throw new BusinessRuleError("A política deve ter pelo menos um componente ativo antes de ser ativada.");
    }

    if (policy.calculationMethod === "WEIGHTED_AVERAGE") {
      const totalWeight = components.reduce((s, c) => s + c.weight, 0);
      if (Math.round(totalWeight) !== 100) {
        throw new BusinessRuleError(
          `O peso total dos componentes deve ser 100% (atual: ${totalWeight.toFixed(1)}%).`
        );
      }
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.GRADE_POLICIES_UPDATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<AssessmentPolicy> {
    const policy = await updateAssessmentPolicy(
      this.input.policyId,
      this.context.organizationId,
      { status: "ACTIVE" }
    );

    await auditService.log(this.context, {
      entity: "AssessmentPolicy",
      entityId: policy.id,
      action: "assessment_policy.activated",
    });

    return policy;
  }
}
