import { BaseCommand, AuthorizationError, ValidationError, NotFoundError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findAcademicHolidayByIdInOrganization,
  updateAcademicHoliday,
  archiveAcademicHoliday,
  softDeleteAcademicHoliday,
} from "@/modules/academic-calendar/repositories/academic-holiday.repository";
import { findAcademicYearByIdInOrganization } from "@/modules/academic-calendar/repositories/academic-year.repository";
import type {
  UpdateAcademicHolidaySchema,
  ArchiveAcademicHolidaySchema,
  DeleteAcademicHolidaySchema,
} from "@/modules/academic-calendar/schemas/academic-holiday.schema";
import type { AcademicHoliday } from "@/modules/academic-calendar/types";

interface UpdateInput extends UpdateAcademicHolidaySchema {
  academicHolidayId: string;
}

export class UpdateAcademicHolidayCommand extends BaseCommand<
  UpdateInput,
  AcademicHoliday
> {
  async validate(): Promise<void> {
    const existing = await findAcademicHolidayByIdInOrganization(
      this.input.academicHolidayId,
      this.context.organizationId
    );
    if (!existing) throw new NotFoundError("Feriado", this.input.academicHolidayId);

    if (this.input.academicYearId) {
      const year = await findAcademicYearByIdInOrganization(
        this.input.academicYearId,
        this.context.organizationId
      );
      if (!year) throw new NotFoundError("Ano Letivo", this.input.academicYearId);
    }

    const start = this.input.startDate ? new Date(this.input.startDate) : existing.startDate;
    const end = this.input.endDate ? new Date(this.input.endDate) : existing.endDate;
    if (start > end) {
      throw new ValidationError("Dados inválidos", {
        endDate: ["A data de fim deve ser igual ou posterior à data de início"],
      });
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ACADEMIC_HOLIDAYS_UPDATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<AcademicHoliday> {
    const holiday = await updateAcademicHoliday(
      this.input.academicHolidayId,
      this.context.organizationId,
      {
        academicYearId: "academicYearId" in this.input ? this.input.academicYearId : undefined,
        name: this.input.name,
        description: "description" in this.input ? this.input.description : undefined,
        startDate: this.input.startDate ? new Date(this.input.startDate) : undefined,
        endDate: this.input.endDate ? new Date(this.input.endDate) : undefined,
        isRecurring: this.input.isRecurring,
        status: this.input.status,
      }
    );

    await auditService.log(this.context, {
      entity: "AcademicHoliday",
      entityId: holiday.id,
      action: "academic_holiday.updated",
      newValues: { name: holiday.name, startDate: holiday.startDate, endDate: holiday.endDate },
    });

    return holiday;
  }
}

export class ArchiveAcademicHolidayCommand extends BaseCommand<
  ArchiveAcademicHolidaySchema,
  void
> {
  async validate(): Promise<void> {
    const holiday = await findAcademicHolidayByIdInOrganization(
      this.input.academicHolidayId,
      this.context.organizationId
    );
    if (!holiday) throw new NotFoundError("Feriado", this.input.academicHolidayId);
    if (holiday.status === "ARCHIVED") {
      throw new ValidationError("Dados inválidos", {
        academicHolidayId: ["Este feriado já está arquivado"],
      });
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ACADEMIC_HOLIDAYS_ARCHIVE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await archiveAcademicHoliday(this.input.academicHolidayId, this.context.organizationId);
    await auditService.log(this.context, {
      entity: "AcademicHoliday",
      entityId: this.input.academicHolidayId,
      action: "academic_holiday.archived",
      newValues: { status: "ARCHIVED" },
    });
  }
}

export class SoftDeleteAcademicHolidayCommand extends BaseCommand<
  DeleteAcademicHolidaySchema,
  void
> {
  async validate(): Promise<void> {
    const holiday = await findAcademicHolidayByIdInOrganization(
      this.input.academicHolidayId,
      this.context.organizationId
    );
    if (!holiday) throw new NotFoundError("Feriado", this.input.academicHolidayId);
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ACADEMIC_HOLIDAYS_DELETE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await softDeleteAcademicHoliday(this.input.academicHolidayId, this.context.organizationId);
    await auditService.log(this.context, {
      entity: "AcademicHoliday",
      entityId: this.input.academicHolidayId,
      action: "academic_holiday.deleted",
      newValues: { deleted: true },
    });
  }
}
