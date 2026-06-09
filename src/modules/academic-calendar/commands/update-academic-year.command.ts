import { BaseCommand, AuthorizationError, ValidationError, NotFoundError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findAcademicYearByIdInOrganization,
  findAcademicYearByCode,
  updateAcademicYear,
} from "@/modules/academic-calendar/repositories/academic-year.repository";
import {
  updateAcademicYearSchema,
  type UpdateAcademicYearSchema,
} from "@/modules/academic-calendar/schemas/academic-year.schema";
import type { AcademicYear } from "@/modules/academic-calendar/types";

interface Input extends UpdateAcademicYearSchema {
  academicYearId: string;
}

export class UpdateAcademicYearCommand extends BaseCommand<Input, AcademicYear> {
  async validate(): Promise<void> {
    const result = updateAcademicYearSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const existing = await findAcademicYearByIdInOrganization(
      this.input.academicYearId,
      this.context.organizationId
    );
    if (!existing) throw new NotFoundError("Ano Letivo", this.input.academicYearId);

    if (this.input.code) {
      const duplicate = await findAcademicYearByCode(
        this.context.organizationId,
        this.input.code,
        this.input.academicYearId
      );
      if (duplicate) {
        throw new ValidationError("Dados inválidos", {
          code: ["Já existe um ano letivo com este código nesta organização"],
        });
      }
    }

    if (this.input.startDate && this.input.endDate) {
      if (new Date(this.input.startDate) >= new Date(this.input.endDate)) {
        throw new ValidationError("Dados inválidos", {
          endDate: ["A data de fim deve ser posterior à data de início"],
        });
      }
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ACADEMIC_YEARS_UPDATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<AcademicYear> {
    const year = await updateAcademicYear(
      this.input.academicYearId,
      this.context.organizationId,
      {
        name: this.input.name,
        code: this.input.code,
        startDate: this.input.startDate ? new Date(this.input.startDate) : undefined,
        endDate: this.input.endDate ? new Date(this.input.endDate) : undefined,
        status: this.input.status,
      }
    );

    await auditService.log(this.context, {
      entity: "AcademicYear",
      entityId: year.id,
      action: "academic_year.updated",
      newValues: { name: year.name, code: year.code, status: year.status },
    });

    return year;
  }
}
