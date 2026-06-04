"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization } from "@/server/auth/context";
import { CreateClassScheduleCommand } from "@/modules/class-groups/commands/create-class-schedule.command";
import { UpdateClassScheduleCommand } from "@/modules/class-groups/commands/update-class-schedule.command";
import { DeleteClassScheduleCommand } from "@/modules/class-groups/commands/delete-class-schedule.command";
import type {
  CreateClassScheduleSchema,
  UpdateClassScheduleSchema,
} from "@/modules/class-groups/schemas/class-schedule.schema";
import type { ActionResult } from "@/shared/types/common";
import type { ClassSchedule } from "@/modules/class-groups/types";

export async function createClassScheduleAction(
  classGroupId: string,
  input: CreateClassScheduleSchema
): Promise<ActionResult<ClassSchedule>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new CreateClassScheduleCommand({ classGroupId, ...input }, context);
    const schedule = await cmd.run();
    revalidatePath(`/class-groups/${classGroupId}`);
    return schedule;
  });
}

export async function updateClassScheduleAction(
  classGroupId: string,
  scheduleId: string,
  input: UpdateClassScheduleSchema
): Promise<ActionResult<ClassSchedule>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new UpdateClassScheduleCommand(
      { classGroupId, scheduleId, ...input },
      context
    );
    const schedule = await cmd.run();
    revalidatePath(`/class-groups/${classGroupId}`);
    return schedule;
  });
}

export async function deleteClassScheduleAction(
  classGroupId: string,
  scheduleId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new DeleteClassScheduleCommand(
      { classGroupId, scheduleId },
      context
    );
    await cmd.run();
    revalidatePath(`/class-groups/${classGroupId}`);
  });
}
