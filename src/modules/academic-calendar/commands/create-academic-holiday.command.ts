import { BaseCommand, AuthorizationError, ValidationError, NotFoundError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { createAcademicHoliday } from "@/modules/academic-calendar/repositories/academic-holiday.repository";
import { findAcademicYearByIdInOrganization } from "@/modules/academic-calendar/repositories/academic-year.repository";
import {
  createAcademicHolidaySchema,
  type CreateAcademicHolidaySchema,
} from "@/modules/academic-calendar/schemas/academic-holiday.schema";
import type { AcademicHoliday } from "@/modules/academic-calendar/types";

export class CreateAcademicHolidayCommand extends BaseCommand<
  CreateAcademicHolidaySchema,
  AcademicHoliday
> {
  async validate(): Promise<void> {
    const result = createAcademicHolidaySchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    // Validate academicYearId belongs to this organization if provided
    if (this.input.academicYearId) {
      const year = await findAcademicYearByIdInOrganization(
        this.input.academicYearId,
        this.context.organizationId
      );
      if (!year) throw new NotFoundError("Ano Letivo", this.input.academicYearId);
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ACADEMIC_HOLIDAYS_CREATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<AcademicHoliday> {
    const holiday = await createAcademicHoliday({
      organizationId: this.context.organizationId,
      academicYearId: this.input.academicYearId ?? null,
      name: this.input.name,
      description: this.input.description ?? null,
      startDate: new Date(this.input.startDate),
      endDate: new Date(this.input.endDate),
      isRecurring: this.input.isRecurring ?? false,
      status: this.input.status ?? "ACTIVE",
    });

    await auditService.log(this.context, {
      entity: "AcademicHoliday",
      entityId: holiday.id,
      action: "academic_holiday.created",
      newValues: { name: holiday.name, startDate: holiday.startDate, endDate: holiday.endDate },
    });

    return holiday;
  }
}
