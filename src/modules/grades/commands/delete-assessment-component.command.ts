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
  findComponentById,
  softDeleteAssessmentComponent,
} from "@/modules/assessments/repositories/assessment-component.repository";
import {
  deleteGradeComponentSchema,
  type DeleteGradeComponentSchema,
} from "@/modules/grades/schemas/grade.schema";

export class DeleteAssessmentComponentCommand extends BaseCommand<
  DeleteGradeComponentSchema,
  void
> {
  async validate(): Promise<void> {
    const result = deleteGradeComponentSchema.safeParse(this.input);
    if (!result.success) throw new ValidationError("Dados inválidos");

    const component = await findComponentById(this.input.componentId, this.context.organizationId);
    if (!component) throw new NotFoundError("Componente", this.input.componentId);

    // Prevent deletion when live grade results exist
    const db = await getDb();
    const liveResultCount = await db.studentAssessmentResult.count({
      where: {
        assessmentComponentId: this.input.componentId,
        organizationId: this.context.organizationId,
        status: { not: "CANCELLED" },
      },
    });
    if (liveResultCount > 0) {
      throw new BusinessRuleError(
        `Não é possível remover este componente: existem ${liveResultCount} nota(s) registada(s). Cancele as notas antes de remover o componente.`
      );
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.GRADE_COMPONENTS_DELETE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await softDeleteAssessmentComponent(this.input.componentId, this.context.organizationId);

    await auditService.log(this.context, {
      entity: "AssessmentComponent",
      entityId: this.input.componentId,
      action: "assessment_component.deleted",
    });
  }
}
