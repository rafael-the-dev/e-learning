import { BaseCommand, AuthorizationError, ValidationError, NotFoundError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findAcademicYearByIdInOrganization,
  setDefaultAcademicYear,
} from "@/modules/academic-calendar/repositories/academic-year.repository";
import type { SetDefaultAcademicYearSchema } from "@/modules/academic-calendar/schemas/academic-year.schema";

export class SetDefaultAcademicYearCommand extends BaseCommand<
  SetDefaultAcademicYearSchema,
  void
> {
  async validate(): Promise<void> {
    const year = await findAcademicYearByIdInOrganization(
      this.input.academicYearId,
      this.context.organizationId
    );
    if (!year) throw new NotFoundError("Ano Letivo", this.input.academicYearId);

    if (year.status === "ARCHIVED" || year.status === "CANCELLED") {
      throw new ValidationError("Dados inválidos", {
        academicYearId: ["Não é possível definir como predefinido um ano letivo arquivado ou cancelado"],
      });
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ACADEMIC_YEARS_SET_DEFAULT)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await setDefaultAcademicYear(this.input.academicYearId, this.context.organizationId);

    await auditService.log(this.context, {
      entity: "AcademicYear",
      entityId: this.input.academicYearId,
      action: "academic_year.default_set",
      newValues: { isDefault: true },
    });
  }
}
