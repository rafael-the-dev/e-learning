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
  createAssessmentPeriod,
  findAssessmentPeriodByCode,
} from "@/modules/assessments/repositories/assessment-period.repository";
import {
  createAssessmentPeriodSchema,
  type CreateAssessmentPeriodSchema,
} from "@/modules/assessments/schemas/assessment.schema";
import type { AssessmentPeriod } from "@/modules/assessments/types";

export class CreateAssessmentPeriodCommand extends BaseCommand<
  CreateAssessmentPeriodSchema,
  AssessmentPeriod
> {
  async validate(): Promise<void> {
    const result = createAssessmentPeriodSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const startDate = new Date(this.input.startDate);
    const endDate = new Date(this.input.endDate);
    if (startDate > endDate) {
      throw new ValidationError("Dados inválidos", {
        endDate: ["A data de fim deve ser posterior à data de início"],
      });
    }

    const { organizationId } = this.context;
    const db = await getDb();

    const academicYear = await db.academicYear.findFirst({
      where: { id: this.input.academicYearId, organizationId, deletedAt: null },
    });
    if (!academicYear) throw new NotFoundError("Ano letivo", this.input.academicYearId);

    if (this.input.academicTermId) {
      const term = await db.academicTerm.findFirst({
        where: {
          id: this.input.academicTermId,
          organizationId,
          academicYearId: this.input.academicYearId,
          deletedAt: null,
        },
      });
      if (!term) throw new NotFoundError("Período letivo", this.input.academicTermId);
    }

    const duplicate = await findAssessmentPeriodByCode(this.input.code, organizationId);
    if (duplicate) {
      throw new BusinessRuleError(
        `Já existe um período de avaliação com o código "${this.input.code}".`
      );
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ASSESSMENT_PERIODS_CREATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<AssessmentPeriod> {
    const period = await createAssessmentPeriod({
      organizationId: this.context.organizationId,
      academicYearId: this.input.academicYearId,
      academicTermId: this.input.academicTermId ?? null,
      name: this.input.name,
      code: this.input.code.toUpperCase(),
      startDate: new Date(this.input.startDate),
      endDate: new Date(this.input.endDate),
      order: this.input.order,
    });

    await auditService.log(this.context, {
      entity: "AssessmentPeriod",
      entityId: period.id,
      action: "assessment_period.created",
      newValues: { name: period.name, code: period.code, academicYearId: period.academicYearId },
    });

    return period;
  }
}
