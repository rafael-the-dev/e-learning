"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization } from "@/server/auth/context";
import { CreateSchedulePeriodCommand } from "@/modules/schedules/commands/create-schedule-period.command";
import { UpdateSchedulePeriodCommand } from "@/modules/schedules/commands/update-schedule-period.command";
import { ArchiveSchedulePeriodCommand } from "@/modules/schedules/commands/archive-schedule-period.command";
import { SoftDeleteSchedulePeriodCommand } from "@/modules/schedules/commands/delete-schedule-period.command";
import type {
  CreateSchedulePeriodSchema,
  UpdateSchedulePeriodSchema,
} from "@/modules/schedules/schemas/schedule-period.schema";
import type { ActionResult } from "@/shared/types/common";
import type { SchedulePeriod } from "@/modules/schedules/types";

export async function createSchedulePeriodAction(
  input: CreateSchedulePeriodSchema
): Promise<ActionResult<SchedulePeriod>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new CreateSchedulePeriodCommand(input, context);
    const period = await cmd.run();
    revalidatePath("/schedules");
    return period;
  });
}

export async function updateSchedulePeriodAction(
  schedulePeriodId: string,
  input: UpdateSchedulePeriodSchema
): Promise<ActionResult<SchedulePeriod>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new UpdateSchedulePeriodCommand({ schedulePeriodId, ...input }, context);
    const period = await cmd.run();
    revalidatePath("/schedules");
    return period;
  });
}

export async function archiveSchedulePeriodAction(
  schedulePeriodId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new ArchiveSchedulePeriodCommand({ schedulePeriodId }, context);
    await cmd.run();
    revalidatePath("/schedules");
  });
}

export async function deleteSchedulePeriodAction(
  schedulePeriodId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new SoftDeleteSchedulePeriodCommand({ schedulePeriodId }, context);
    await cmd.run();
    revalidatePath("/schedules");
  });
}
