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
  archiveAssessmentComponentSchema,
  type ArchiveAssessmentComponentSchema,
} from "@/modules/assessments/schemas/assessment.schema";

export class ArchiveAssessmentComponentCommand extends BaseCommand<ArchiveAssessmentComponentSchema, void> {
  async validate(): Promise<void> {
    const result = archiveAssessmentComponentSchema.safeParse(this.input);
    if (!result.success) throw new ValidationError("Dados inválidos");

    const component = await findComponentById(this.input.componentId, this.context.organizationId);
    if (!component) throw new NotFoundError("Componente de avaliação", this.input.componentId);
    if (component.status === "ARCHIVED") {
      throw new ValidationError("Dados inválidos", {
        componentId: ["O componente já está arquivado"],
      });
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ASSESSMENT_COMPONENTS_MANAGE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await updateAssessmentComponent(this.input.componentId, this.context.organizationId, {
      status: "ARCHIVED",
    });

    await auditService.log(this.context, {
      entity: "AssessmentComponent",
      entityId: this.input.componentId,
      action: "assessment_component.archived",
    });
  }
}
