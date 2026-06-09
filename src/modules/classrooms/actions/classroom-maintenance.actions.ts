"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization } from "@/server/auth/context";
import { CreateClassroomMaintenanceCommand } from "@/modules/classrooms/commands/create-classroom-maintenance.command";
import { UpdateClassroomMaintenanceCommand } from "@/modules/classrooms/commands/update-classroom-maintenance.command";
import { CancelClassroomMaintenanceCommand } from "@/modules/classrooms/commands/cancel-classroom-maintenance.command";
import type { CreateClassroomMaintenanceSchema, UpdateClassroomMaintenanceSchema, CancelClassroomMaintenanceSchema } from "@/modules/classrooms/schemas/classroom-maintenance.schema";
import type { ActionResult } from "@/shared/types/common";
import type { ClassroomMaintenance } from "@/modules/classrooms/types";

export async function createClassroomMaintenanceAction(
  input: CreateClassroomMaintenanceSchema
): Promise<ActionResult<ClassroomMaintenance>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new CreateClassroomMaintenanceCommand(input, context);
    const maintenance = await cmd.run();
    revalidatePath(`/classrooms/${input.classroomId}`);
    return maintenance;
  });
}

export async function updateClassroomMaintenanceAction(
  maintenanceId: string,
  classroomId: string,
  input: UpdateClassroomMaintenanceSchema
): Promise<ActionResult<ClassroomMaintenance>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new UpdateClassroomMaintenanceCommand({ maintenanceId, classroomId, ...input }, context);
    const maintenance = await cmd.run();
    revalidatePath(`/classrooms/${classroomId}`);
    return maintenance;
  });
}

export async function cancelClassroomMaintenanceAction(
  input: CancelClassroomMaintenanceSchema
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new CancelClassroomMaintenanceCommand(input, context);
    await cmd.run();
    revalidatePath(`/classrooms/${input.classroomId}`);
  });
}
