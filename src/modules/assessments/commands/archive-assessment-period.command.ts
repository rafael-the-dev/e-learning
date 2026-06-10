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
  findAssessmentPeriodById,
  updateAssessmentPeriod,
} from "@/modules/assessments/repositories/assessment-period.repository";
import {
  archiveAssessmentPeriodSchema,
  type ArchiveAssessmentPeriodSchema,
} from "@/modules/assessments/schemas/assessment.schema";

export class ArchiveAssessmentPeriodCommand extends BaseCommand<ArchiveAssessmentPeriodSchema, void> {
  async validate(): Promise<void> {
    const result = archiveAssessmentPeriodSchema.safeParse(this.input);
    if (!result.success) throw new ValidationError("Dados inválidos");

    const period = await findAssessmentPeriodById(this.input.periodId, this.context.organizationId);
    if (!period) throw new NotFoundError("Período de avaliação", this.input.periodId);
    if (period.status === "ARCHIVED") {
      throw new ValidationError("Dados inválidos", {
        periodId: ["O período já está arquivado"],
      });
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ASSESSMENT_PERIODS_ARCHIVE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await updateAssessmentPeriod(this.input.periodId, this.context.organizationId, {
      status: "ARCHIVED",
    });

    await auditService.log(this.context, {
      entity: "AssessmentPeriod",
      entityId: this.input.periodId,
      action: "assessment_period.archived",
    });
  }
}
