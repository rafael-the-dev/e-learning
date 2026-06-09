import { BaseCommand, AuthorizationError, ValidationError, NotFoundError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { createAcademicEvent } from "@/modules/academic-calendar/repositories/academic-event.repository";
import { findAcademicYearByIdInOrganization } from "@/modules/academic-calendar/repositories/academic-year.repository";
import { findAcademicTermByIdInOrganization } from "@/modules/academic-calendar/repositories/academic-term.repository";
import {
  createAcademicEventSchema,
  type CreateAcademicEventSchema,
} from "@/modules/academic-calendar/schemas/academic-event.schema";
import type { AcademicEvent } from "@/modules/academic-calendar/types";

export class CreateAcademicEventCommand extends BaseCommand<
  CreateAcademicEventSchema,
  AcademicEvent
> {
  async validate(): Promise<void> {
    const result = createAcademicEventSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

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
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ACADEMIC_EVENTS_CREATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<AcademicEvent> {
    const event = await createAcademicEvent({
      organizationId: this.context.organizationId,
      academicYearId: this.input.academicYearId ?? null,
      academicTermId: this.input.academicTermId ?? null,
      title: this.input.title,
      description: this.input.description ?? null,
      eventType: this.input.eventType ?? "GENERAL",
      startDate: new Date(this.input.startDate),
      endDate: new Date(this.input.endDate),
      status: this.input.status ?? "DRAFT",
    });

    await auditService.log(this.context, {
      entity: "AcademicEvent",
      entityId: event.id,
      action: "academic_event.created",
      newValues: { title: event.title, eventType: event.eventType, status: event.status },
    });

    return event;
  }
}
