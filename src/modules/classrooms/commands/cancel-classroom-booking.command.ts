import {
  BaseCommand,
  AuthorizationError,
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
import type { CancelClassroomBookingSchema } from "@/modules/classrooms/schemas/classroom-booking.schema";

export class CancelClassroomBookingCommand extends BaseCommand<CancelClassroomBookingSchema, void> {
  async validate(): Promise<void> {
    const booking = await findBookingById(this.input.bookingId, this.context.organizationId);
    if (!booking) throw new NotFoundError("Reserva", this.input.bookingId);
    if (booking.status === "CANCELLED") throw new BusinessRuleError("A reserva já está cancelada.");
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.CLASSROOM_BOOKINGS_CANCEL)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await updateClassroomBooking(this.input.bookingId, this.context.organizationId, { status: "CANCELLED" });

    await auditService.log(this.context, {
      entity: "ClassroomBooking",
      entityId: this.input.bookingId,
      action: "classroom_booking.cancelled",
    });
  }
}
