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
} from "@/modules/assessments/repositories/assessment-policy.repository";
import {
  createAssessmentComponent,
} from "@/modules/assessments/repositories/assessment-component.repository";
import {
  createGradeComponentSchema,
  type CreateGradeComponentSchema,
} from "@/modules/grades/schemas/grade.schema";
import type { AssessmentComponent } from "@/modules/assessments/types";

export class CreateAssessmentComponentCommand extends BaseCommand<
  CreateGradeComponentSchema,
  AssessmentComponent
> {
  async validate(): Promise<void> {
    const result = createGradeComponentSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const policy = await findAssessmentPolicyById(
      this.input.assessmentPolicyId,
      this.context.organizationId
    );
    if (!policy) throw new NotFoundError("Política de avaliação", this.input.assessmentPolicyId);
    if (policy.status === "ARCHIVED") {
      throw new ValidationError("Dados inválidos", {
        assessmentPolicyId: ["Não é possível adicionar componentes a uma política arquivada"],
      });
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.GRADE_COMPONENTS_CREATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<AssessmentComponent> {
    const component = await createAssessmentComponent({
      organizationId: this.context.organizationId,
      assessmentPolicyId: this.input.assessmentPolicyId,
      name: this.input.name,
      componentType: this.input.type,
      weight: this.input.weight,
      maxGrade: this.input.maxGrade,
      order: this.input.order,
      isRequired: this.input.isRequired,
    });

    await auditService.log(this.context, {
      entity: "AssessmentComponent",
      entityId: component.id,
      action: "assessment_component.created",
      newValues: {
        name: component.name,
        componentType: component.componentType,
        weight: component.weight,
        maxGrade: component.maxGrade,
      },
    });

    return component;
  }
}
