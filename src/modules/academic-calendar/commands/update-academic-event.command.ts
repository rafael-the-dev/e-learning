import { BaseCommand, AuthorizationError, ValidationError, NotFoundError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findAcademicEventByIdInOrganization,
  updateAcademicEvent,
  archiveAcademicEvent,
  softDeleteAcademicEvent,
} from "@/modules/academic-calendar/repositories/academic-event.repository";
import { findAcademicYearByIdInOrganization } from "@/modules/academic-calendar/repositories/academic-year.repository";
import { findAcademicTermByIdInOrganization } from "@/modules/academic-calendar/repositories/academic-term.repository";
import type {
  UpdateAcademicEventSchema,
  ArchiveAcademicEventSchema,
  DeleteAcademicEventSchema,
} from "@/modules/academic-calendar/schemas/academic-event.schema";
import type { AcademicEvent } from "@/modules/academic-calendar/types";

interface UpdateInput extends UpdateAcademicEventSchema {
  academicEventId: string;
}

export class UpdateAcademicEventCommand extends BaseCommand<UpdateInput, AcademicEvent> {
  async validate(): Promise<void> {
    const existing = await findAcademicEventByIdInOrganization(
      this.input.academicEventId,
      this.context.organizationId
    );
    if (!existing) throw new NotFoundError("Evento", this.input.academicEventId);

    if (this.input.academicYearId) {
      const year = await findAcademicYearByIdInOrganization(
        this.input.academicYearId,
        this.context.organizationId
      );
      if (!year) throw new NotFoundError("Ano Letivo", this.input.academicYearId);
    }

    if (this.input.academicTermId) {
      const term = await findAcademicTermByIdInOrganization(
        this.input.academicTermId,
        this.context.organizationId
      );
      if (!term) throw new NotFoundError("Período Letivo", this.input.academicTermId);
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
    if (!createAbility(perms).can(PERMISSIONS.ACADEMIC_EVENTS_UPDATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<AcademicEvent> {
    const event = await updateAcademicEvent(
      this.input.academicEventId,
      this.context.organizationId,
      {
        academicYearId: "academicYearId" in this.input ? this.input.academicYearId : undefined,
        academicTermId: "academicTermId" in this.input ? this.input.academicTermId : undefined,
        title: this.input.title,
        description: "description" in this.input ? this.input.description : undefined,
        eventType: this.input.eventType,
        startDate: this.input.startDate ? new Date(this.input.startDate) : undefined,
        endDate: this.input.endDate ? new Date(this.input.endDate) : undefined,
        status: this.input.status,
      }
    );

    await auditService.log(this.context, {
      entity: "AcademicEvent",
      entityId: event.id,
      action: "academic_event.updated",
      newValues: { title: event.title, eventType: event.eventType, status: event.status },
    });

    return event;
  }
}

export class ArchiveAcademicEventCommand extends BaseCommand<
  ArchiveAcademicEventSchema,
  void
> {
  async validate(): Promise<void> {
    const event = await findAcademicEventByIdInOrganization(
      this.input.academicEventId,
      this.context.organizationId
    );
    if (!event) throw new NotFoundError("Evento", this.input.academicEventId);
    if (event.status === "ARCHIVED") {
      throw new ValidationError("Dados inválidos", {
        academicEventId: ["Este evento já está arquivado"],
      });
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ACADEMIC_EVENTS_ARCHIVE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await archiveAcademicEvent(this.input.academicEventId, this.context.organizationId);
    await auditService.log(this.context, {
      entity: "AcademicEvent",
      entityId: this.input.academicEventId,
      action: "academic_event.archived",
      newValues: { status: "ARCHIVED" },
    });
  }
}

export class SoftDeleteAcademicEventCommand extends BaseCommand<
  DeleteAcademicEventSchema,
  void
> {
  async validate(): Promise<void> {
    const event = await findAcademicEventByIdInOrganization(
      this.input.academicEventId,
      this.context.organizationId
    );
    if (!event) throw new NotFoundError("Evento", this.input.academicEventId);
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ACADEMIC_EVENTS_DELETE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await softDeleteAcademicEvent(this.input.academicEventId, this.context.organizationId);
    await auditService.log(this.context, {
      entity: "AcademicEvent",
      entityId: this.input.academicEventId,
      action: "academic_event.deleted",
      newValues: { deleted: true },
    });
  }
}
