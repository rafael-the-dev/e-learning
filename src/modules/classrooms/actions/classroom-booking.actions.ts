"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization } from "@/server/auth/context";
import { CreateClassroomBookingCommand } from "@/modules/classrooms/commands/create-classroom-booking.command";
import { UpdateClassroomBookingCommand } from "@/modules/classrooms/commands/update-classroom-booking.command";
import { CancelClassroomBookingCommand } from "@/modules/classrooms/commands/cancel-classroom-booking.command";
import type { CreateClassroomBookingSchema, UpdateClassroomBookingSchema, CancelClassroomBookingSchema } from "@/modules/classrooms/schemas/classroom-booking.schema";
import type { ActionResult } from "@/shared/types/common";
import type { ClassroomBooking } from "@/modules/classrooms/types";

export async function createClassroomBookingAction(
  input: CreateClassroomBookingSchema
): Promise<ActionResult<ClassroomBooking>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new CreateClassroomBookingCommand(input, context);
    const booking = await cmd.run();
    revalidatePath("/classroom-bookings");
    revalidatePath(`/classrooms/${input.classroomId}`);
    return booking;
  });
}

export async function updateClassroomBookingAction(
  bookingId: string,
  input: UpdateClassroomBookingSchema
): Promise<ActionResult<ClassroomBooking>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new UpdateClassroomBookingCommand({ bookingId, ...input }, context);
    const booking = await cmd.run();
    revalidatePath("/classroom-bookings");
    revalidatePath(`/classroom-bookings/${bookingId}`);
    return booking;
  });
}

export async function cancelClassroomBookingAction(
  input: CancelClassroomBookingSchema
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new CancelClassroomBookingCommand(input, context);
    await cmd.run();
    revalidatePath("/classroom-bookings");
    revalidatePath(`/classroom-bookings/${input.bookingId}`);
  });
}
