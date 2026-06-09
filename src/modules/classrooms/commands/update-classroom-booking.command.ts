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
import {
  findBookingById,
  updateClassroomBooking,
} from "@/modules/classrooms/repositories/classroom-booking.repository";
import { classroomAvailabilityService } from "@/modules/classrooms/services/classroom-availability.service";
import {
  updateClassroomBookingSchema,
  type UpdateClassroomBookingSchema,
} from "@/modules/classrooms/schemas/classroom-booking.schema";
import type { ClassroomBooking } from "@/modules/classrooms/types";

type Input = UpdateClassroomBookingSchema & { bookingId: string };

export class UpdateClassroomBookingCommand extends BaseCommand<Input, ClassroomBooking> {
  async validate(): Promise<void> {
    const { bookingId, ...rest } = this.input;
    const result = updateClassroomBookingSchema.safeParse(rest);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const booking = await findBookingById(bookingId, this.context.organizationId);
    if (!booking) throw new NotFoundError("Reserva", bookingId);
    if (booking.status === "CANCELLED") throw new BusinessRuleError("Não é possível alterar uma reserva cancelada.");

    if (this.input.startDate || this.input.endDate) {
      const startDate = new Date(this.input.startDate ?? booking.startDate);
      const endDate = new Date(this.input.endDate ?? booking.endDate);
      if (startDate > endDate) {
        throw new ValidationError("Dados inválidos", {
          endDate: ["A data de fim deve ser posterior ou igual à data de início"],
        });
      }

      const availability = await classroomAvailabilityService.validateClassroomAvailability({
        classroomId: booking.classroomId,
        organizationId: this.context.organizationId,
        startDate,
        endDate,
        excludeBookingId: bookingId,
      });

      if (!availability.available) {
        throw new BusinessRuleError(availability.reasons.join(" "));
      }
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.CLASSROOM_BOOKINGS_UPDATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<ClassroomBooking> {
    const { bookingId, ...data } = this.input;
    const booking = await updateClassroomBooking(bookingId, this.context.organizationId, {
      ...data,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      endDate: data.endDate ? new Date(data.endDate) : undefined,
    });

    await auditService.log(this.context, {
      entity: "ClassroomBooking",
      entityId: bookingId,
      action: "classroom_booking.updated",
      newValues: data,
    });

    return booking;
  }
}
