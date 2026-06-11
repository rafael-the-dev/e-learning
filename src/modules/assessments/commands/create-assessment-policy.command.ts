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
import { getDb } from "@/server/db";
import {
  createAssessmentPolicy,
  findActivePolicyForLevelSubject,
} from "@/modules/assessments/repositories/assessment-policy.repository";
import {
  createAssessmentPolicySchema,
  type CreateAssessmentPolicySchema,
} from "@/modules/assessments/schemas/assessment.schema";
import type { AssessmentPolicy } from "@/modules/assessments/types";

export class CreateAssessmentPolicyCommand extends BaseCommand<
  CreateAssessmentPolicySchema,
  AssessmentPolicy
> {
  async validate(): Promise<void> {
    const result = createAssessmentPolicySchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const db = await getDb();
    const { organizationId } = this.context;

    const levelSubject = await db.levelSubject.findFirst({
      where: { id: this.input.levelSubjectId, organizationId, deletedAt: null },
    });
    if (!levelSubject) throw new NotFoundError("Configuração de disciplina", this.input.levelSubjectId);

    const existing = await findActivePolicyForLevelSubject(this.input.levelSubjectId, organizationId);
    if (existing) {
      throw new BusinessRuleError(
        "Já existe uma política de avaliação ativa para esta configuração de disciplina."
      );
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ASSESSMENT_POLICIES_CREATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<AssessmentPolicy> {
    const policy = await createAssessmentPolicy({
      organizationId: this.context.organizationId,
      levelSubjectId: this.input.levelSubjectId,
      name: this.input.name,
      description: this.input.description ?? null,
      calculationMethod: this.input.calculationMethod,
      roundingMethod: this.input.roundingMethod,
      minimumPassingGrade: this.input.minimumPassingGrade,
      allowRetake: this.input.allowRetake,
      maxRetakes: this.input.maxRetakes,
      allowRecovery: false,
    });

    await auditService.log(this.context, {
      entity: "AssessmentPolicy",
      entityId: policy.id,
      action: "assessment_policy.created",
      newValues: {
        levelSubjectId: policy.levelSubjectId,
        name: policy.name,
        calculationMethod: policy.calculationMethod,
        minimumPassingGrade: policy.minimumPassingGrade,
      },
    });

    return policy;
  }
}
