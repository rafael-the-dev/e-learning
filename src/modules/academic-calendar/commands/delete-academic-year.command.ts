import { BaseCommand, AuthorizationError, ValidationError, NotFoundError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findAcademicYearByIdInOrganization,
  softDeleteAcademicYear,
  countActiveTermsForYear,
} from "@/modules/academic-calendar/repositories/academic-year.repository";
import type { DeleteAcademicYearSchema } from "@/modules/academic-calendar/schemas/academic-year.schema";

export class SoftDeleteAcademicYearCommand extends BaseCommand<
  DeleteAcademicYearSchema,
  void
> {
  async validate(): Promise<void> {
    const year = await findAcademicYearByIdInOrganization(
      this.input.academicYearId,
      this.context.organizationId
    );
    if (!year) throw new NotFoundError("Ano Letivo", this.input.academicYearId);

    if (year.isDefault) {
      throw new ValidationError("Dados inválidos", {
        academicYearId: ["Não é possível eliminar o ano letivo predefinido"],
      });
    }

    const activeTerms = await countActiveTermsForYear(
      this.input.academicYearId,
      this.context.organizationId
    );
    if (activeTerms > 0) {
      throw new ValidationError("Dados inválidos", {
        academicYearId: [
          `Este ano letivo tem ${activeTerms} período(s) ativo(s). Archive-os primeiro.`,
        ],
      });
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ACADEMIC_YEARS_DELETE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await softDeleteAcademicYear(this.input.academicYearId, this.context.organizationId);

    await auditService.log(this.context, {
      entity: "AcademicYear",
      entityId: this.input.academicYearId,
      action: "academic_year.deleted",
      newValues: { deleted: true },
    });
  }
}
