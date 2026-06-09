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
import { eventPublisher } from "@/server/events/event-publisher";
import { DomainEventType, DomainAggregateType } from "@/server/events/event-types";
import { classroomAvailabilityService } from "@/modules/classrooms/services/classroom-availability.service";
import { createClassroomBooking } from "@/modules/classrooms/repositories/classroom-booking.repository";
import { findAcademicYearByIdInOrganization } from "@/modules/academic-calendar/repositories/academic-year.repository";
import { findAcademicTermByIdInOrganization } from "@/modules/academic-calendar/repositories/academic-term.repository";
import {
  createClassroomBookingSchema,
  type CreateClassroomBookingSchema,
} from "@/modules/classrooms/schemas/classroom-booking.schema";
import type { ClassroomBooking } from "@/modules/classrooms/types";
import { getDb } from "@/server/db";

export class CreateClassroomBookingCommand extends BaseCommand<CreateClassroomBookingSchema, ClassroomBooking> {
  async validate(): Promise<void> {
    const result = createClassroomBookingSchema.safeParse(this.input);
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
        endDate: ["A data de fim deve ser posterior ou igual à data de início"],
      });
    }

    // Validate academic year
    const academicYear = await findAcademicYearByIdInOrganization(
      this.input.academicYearId,
      this.context.organizationId
    );
    if (!academicYear) throw new NotFoundError("Ano Letivo", this.input.academicYearId);
    if (academicYear.status !== "ACTIVE") {
      throw new BusinessRuleError("O ano letivo selecionado não está ativo.");
    }

    // Validate academic term belongs to year
    if (this.input.academicTermId) {
      const term = await findAcademicTermByIdInOrganization(
        this.input.academicTermId,
        this.context.organizationId
      );
      if (!term) throw new NotFoundError("Período Letivo", this.input.academicTermId);
      if (term.academicYearId !== this.input.academicYearId) {
        throw new ValidationError("Dados inválidos", {
          academicTermId: ["O período não pertence ao ano letivo selecionado"],
        });
      }
      if (term.status !== "ACTIVE") {
        throw new BusinessRuleError("O período letivo selecionado não está ativo.");
      }
    }

    // Validate class group and get capacity
    let classGroupCapacity: number | undefined;
    let branchId: string | null = null;
    if (this.input.classGroupId) {
      const db = await getDb();
      const group = await db.classGroup.findFirst({
        where: { id: this.input.classGroupId, organizationId: this.context.organizationId, deletedAt: null },
        select: { id: true, capacity: true, branchId: true },
      });
      if (!group) throw new NotFoundError("Turma", this.input.classGroupId);
      classGroupCapacity = group.capacity;
      branchId = group.branchId;
    }

    // Validate schedule slot
    if (this.input.scheduleSlotId) {
      const db = await getDb();
      const slot = await db.scheduleSlot.findFirst({
        where: { id: this.input.scheduleSlotId, organizationId: this.context.organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!slot) throw new NotFoundError("Horário", this.input.scheduleSlotId);
    }

    // Availability check
    const availability = await classroomAvailabilityService.validateClassroomAvailability({
      classroomId: this.input.classroomId,
      organizationId: this.context.organizationId,
      startDate,
      endDate,
      classGroupCapacity,
    });

    if (!availability.available) {
      throw new BusinessRuleError(availability.reasons.join(" "));
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.CLASSROOM_BOOKINGS_CREATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<ClassroomBooking> {
    const db = await getDb();
    let branchId: string | null = null;
    if (this.input.classGroupId) {
      const group = await db.classGroup.findFirst({
        where: { id: this.input.classGroupId, organizationId: this.context.organizationId },
        select: { branchId: true },
      });
      branchId = group?.branchId ?? null;
    }

    const booking = await createClassroomBooking({
      organizationId: this.context.organizationId,
      branchId,
      classroomId: this.input.classroomId,
      classGroupId: this.input.classGroupId ?? null,
      scheduleSlotId: this.input.scheduleSlotId ?? null,
      academicYearId: this.input.academicYearId,
      academicTermId: this.input.academicTermId ?? null,
      startDate: new Date(this.input.startDate),
      endDate: new Date(this.input.endDate),
      createdBy: this.context.userId,
    });

    await auditService.log(this.context, {
      entity: "ClassroomBooking",
      entityId: booking.id,
      action: "classroom_booking.created",
      newValues: {
        classroomId: this.input.classroomId,
        classGroupId: this.input.classGroupId,
        academicYearId: this.input.academicYearId,
      },
    });

    await eventPublisher.publish({
      organizationId: this.context.organizationId,
      eventType: DomainEventType.CLASSROOM_BOOKING_CREATED,
      aggregateType: DomainAggregateType.CLASSROOM_BOOKING,
      aggregateId: booking.id,
      actorId: this.context.userId,
      payload: {
        bookingId: booking.id,
        classroomId: this.input.classroomId,
        classGroupId: this.input.classGroupId ?? undefined,
        academicYearId: this.input.academicYearId,
        startDate: this.input.startDate,
        endDate: this.input.endDate,
      },
    });

    return booking;
  }
}
