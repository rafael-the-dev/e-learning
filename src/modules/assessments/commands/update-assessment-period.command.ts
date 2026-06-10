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
  findAssessmentPeriodById,
  findAssessmentPeriodByCode,
  updateAssessmentPeriod,
} from "@/modules/assessments/repositories/assessment-period.repository";
import {
  updateAssessmentPeriodSchema,
  type UpdateAssessmentPeriodSchema,
} from "@/modules/assessments/schemas/assessment.schema";
import type { AssessmentPeriod } from "@/modules/assessments/types";

export class UpdateAssessmentPeriodCommand extends BaseCommand<
  UpdateAssessmentPeriodSchema,
  AssessmentPeriod
> {
  async validate(): Promise<void> {
    const result = updateAssessmentPeriodSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const { organizationId } = this.context;
    const period = await findAssessmentPeriodById(this.input.periodId, organizationId);
    if (!period) throw new NotFoundError("Período de avaliação", this.input.periodId);
    if (period.status === "ARCHIVED") {
      throw new ValidationError("Dados inválidos", {
        periodId: ["Não é possível editar um período arquivado"],
      });
    }

    if (this.input.code && this.input.code !== period.code) {
      const duplicate = await findAssessmentPeriodByCode(this.input.code, organizationId);
      if (duplicate) {
        throw new BusinessRuleError(`Já existe um período com o código "${this.input.code}".`);
      }
    }

    if (this.input.startDate && this.input.endDate) {
      if (new Date(this.input.startDate) > new Date(this.input.endDate)) {
        throw new ValidationError("Dados inválidos", {
          endDate: ["A data de fim deve ser posterior à data de início"],
        });
      }
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ASSESSMENT_PERIODS_UPDATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<AssessmentPeriod> {
    const updateData: Record<string, unknown> = {};
    if (this.input.name !== undefined) updateData.name = this.input.name;
    if (this.input.code !== undefined) updateData.code = this.input.code.toUpperCase();
    if (this.input.startDate !== undefined) updateData.startDate = new Date(this.input.startDate);
    if (this.input.endDate !== undefined) updateData.endDate = new Date(this.input.endDate);
    if (this.input.order !== undefined) updateData.order = this.input.order;

    const period = await updateAssessmentPeriod(
      this.input.periodId,
      this.context.organizationId,
      updateData as any
    );

    await auditService.log(this.context, {
      entity: "AssessmentPeriod",
      entityId: period.id,
      action: "assessment_period.updated",
      newValues: updateData,
    });

    return period;
  }
}
