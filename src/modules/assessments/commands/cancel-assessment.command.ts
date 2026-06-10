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
  findAssessmentById,
  updateAssessment,
} from "@/modules/assessments/repositories/assessment.repository";
import {
  cancelAssessmentSchema,
  type CancelAssessmentSchema,
} from "@/modules/assessments/schemas/assessment.schema";

export class CancelAssessmentCommand extends BaseCommand<CancelAssessmentSchema, void> {
  async validate(): Promise<void> {
    const result = cancelAssessmentSchema.safeParse(this.input);
    if (!result.success) throw new ValidationError("Dados inválidos");

    const assessment = await findAssessmentById(this.input.assessmentId, this.context.organizationId);
    if (!assessment) throw new NotFoundError("Avaliação", this.input.assessmentId);
    if (assessment.status === "CANCELLED") {
      throw new ValidationError("Dados inválidos", {
        assessmentId: ["A avaliação já está cancelada"],
      });
    }
    if (assessment.status === "GRADED") {
      throw new ValidationError("Dados inválidos", {
        assessmentId: ["Não é possível cancelar uma avaliação já classificada"],
      });
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ASSESSMENTS_CANCEL)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await updateAssessment(this.input.assessmentId, this.context.organizationId, {
      status: "CANCELLED",
    });

    await auditService.log(this.context, {
      entity: "Assessment",
      entityId: this.input.assessmentId,
      action: "assessment.cancelled",
      newValues: { reason: this.input.reason ?? null },
    });
  }
}
