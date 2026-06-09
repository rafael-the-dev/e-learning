import { BaseCommand, AuthorizationError, ValidationError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  createAcademicYear,
  findAcademicYearByCode,
  setDefaultAcademicYear,
} from "@/modules/academic-calendar/repositories/academic-year.repository";
import {
  createAcademicYearSchema,
  type CreateAcademicYearSchema,
} from "@/modules/academic-calendar/schemas/academic-year.schema";
import type { AcademicYear } from "@/modules/academic-calendar/types";

export class CreateAcademicYearCommand extends BaseCommand<
  CreateAcademicYearSchema,
  AcademicYear
> {
  async validate(): Promise<void> {
    const result = createAcademicYearSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const duplicate = await findAcademicYearByCode(
      this.context.organizationId,
      this.input.code
    );
    if (duplicate) {
      throw new ValidationError("Dados inválidos", {
        code: ["Já existe um ano letivo com este código nesta organização"],
      });
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ACADEMIC_YEARS_CREATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<AcademicYear> {
    const year = await createAcademicYear({
      organizationId: this.context.organizationId,
      name: this.input.name,
      code: this.input.code,
      startDate: new Date(this.input.startDate),
      endDate: new Date(this.input.endDate),
      status: this.input.status ?? "DRAFT",
      isDefault: false,
    });

    if (this.input.isDefault) {
      await setDefaultAcademicYear(year.id, this.context.organizationId);
    }

    await auditService.log(this.context, {
      entity: "AcademicYear",
      entityId: year.id,
      action: "academic_year.created",
      newValues: { name: year.name, code: year.code, status: year.status },
    });

    return year;
  }
}
