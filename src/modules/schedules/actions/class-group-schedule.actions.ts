"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization } from "@/server/auth/context";
import { AssignScheduleSlotToClassGroupCommand } from "@/modules/schedules/commands/assign-schedule-slot.command";
import { RemoveScheduleSlotFromClassGroupCommand } from "@/modules/schedules/commands/remove-schedule-slot.command";
import type { ActionResult } from "@/shared/types/common";
import type { ClassGroupSchedule } from "@/modules/schedules/types";

export async function assignScheduleSlotAction(
  classGroupId: string,
  scheduleSlotId: string
): Promise<ActionResult<ClassGroupSchedule>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new AssignScheduleSlotToClassGroupCommand(
      { classGroupId, scheduleSlotId },
      context
    );
    const assignment = await cmd.run();
    revalidatePath(`/class-groups/${classGroupId}`);
    return assignment;
  });
}

export async function removeScheduleSlotAction(
  classGroupScheduleId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new RemoveScheduleSlotFromClassGroupCommand(
      { classGroupScheduleId },
      context
    );
    const { classGroupId } = await cmd.run();
    revalidatePath(`/class-groups/${classGroupId}`);
  });
}
