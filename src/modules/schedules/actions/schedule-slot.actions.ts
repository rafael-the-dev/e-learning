"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization } from "@/server/auth/context";
import { CreateScheduleSlotCommand } from "@/modules/schedules/commands/create-schedule-slot.command";
import { UpdateScheduleSlotCommand } from "@/modules/schedules/commands/update-schedule-slot.command";
import { ArchiveScheduleSlotCommand } from "@/modules/schedules/commands/archive-schedule-slot.command";
import { SoftDeleteScheduleSlotCommand } from "@/modules/schedules/commands/delete-schedule-slot.command";
import type {
  CreateScheduleSlotSchema,
  UpdateScheduleSlotSchema,
} from "@/modules/schedules/schemas/schedule-slot.schema";
import type { ActionResult } from "@/shared/types/common";
import type { ScheduleSlot } from "@/modules/schedules/types";

export async function createScheduleSlotAction(
  input: CreateScheduleSlotSchema
): Promise<ActionResult<ScheduleSlot>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new CreateScheduleSlotCommand(input, context);
    const slot = await cmd.run();
    revalidatePath("/schedules");
    return slot;
  });
}

export async function updateScheduleSlotAction(
  scheduleSlotId: string,
  input: UpdateScheduleSlotSchema
): Promise<ActionResult<ScheduleSlot>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new UpdateScheduleSlotCommand({ scheduleSlotId, ...input }, context);
    const slot = await cmd.run();
    revalidatePath("/schedules");
    return slot;
  });
}

export async function archiveScheduleSlotAction(
  scheduleSlotId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new ArchiveScheduleSlotCommand({ scheduleSlotId }, context);
    await cmd.run();
    revalidatePath("/schedules");
  });
}

export async function deleteScheduleSlotAction(
  scheduleSlotId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new SoftDeleteScheduleSlotCommand({ scheduleSlotId }, context);
    await cmd.run();
    revalidatePath("/schedules");
  });
}
