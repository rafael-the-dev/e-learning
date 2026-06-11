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
  updateAssessmentComponent,
} from "@/modules/assessments/repositories/assessment-component.repository";
import {
  updateGradeComponentSchema,
  type UpdateGradeComponentSchema,
} from "@/modules/grades/schemas/grade.schema";
import type { AssessmentComponent } from "@/modules/assessments/types";

export class UpdateAssessmentComponentCommand extends BaseCommand<
  UpdateGradeComponentSchema,
  AssessmentComponent
> {
  async validate(): Promise<void> {
    const result = updateGradeComponentSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const component = await findComponentById(this.input.componentId, this.context.organizationId);
    if (!component) throw new NotFoundError("Componente", this.input.componentId);
    if (component.status === "ARCHIVED") {
      throw new ValidationError("Dados inválidos", {
        componentId: ["Não é possível editar um componente arquivado"],
      });
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.GRADE_COMPONENTS_UPDATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<AssessmentComponent> {
    const { componentId, type, ...rest } = this.input;

    const component = await updateAssessmentComponent(
      componentId,
      this.context.organizationId,
      {
        ...(type ? { componentType: type } : {}),
        ...rest,
      }
    );

    await auditService.log(this.context, {
      entity: "AssessmentComponent",
      entityId: component.id,
      action: "assessment_component.updated",
      newValues: { name: component.name, weight: component.weight, maxGrade: component.maxGrade },
    });

    return component;
  }
}
