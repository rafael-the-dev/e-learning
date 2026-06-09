"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization } from "@/server/auth/context";
import { CreateClassroomResourceCommand } from "@/modules/classrooms/commands/create-classroom-resource.command";
import { UpdateClassroomResourceCommand } from "@/modules/classrooms/commands/update-classroom-resource.command";
import { DeleteClassroomResourceCommand } from "@/modules/classrooms/commands/delete-classroom-resource.command";
import type { CreateClassroomResourceSchema, UpdateClassroomResourceSchema, DeleteClassroomResourceSchema } from "@/modules/classrooms/schemas/classroom-resource.schema";
import type { ActionResult } from "@/shared/types/common";
import type { ClassroomResource } from "@/modules/classrooms/types";

export async function createClassroomResourceAction(
  input: CreateClassroomResourceSchema
): Promise<ActionResult<ClassroomResource>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new CreateClassroomResourceCommand(input, context);
    const resource = await cmd.run();
    revalidatePath(`/classrooms/${input.classroomId}`);
    return resource;
  });
}

export async function updateClassroomResourceAction(
  resourceId: string,
  classroomId: string,
  input: UpdateClassroomResourceSchema
): Promise<ActionResult<ClassroomResource>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new UpdateClassroomResourceCommand({ resourceId, classroomId, ...input }, context);
    const resource = await cmd.run();
    revalidatePath(`/classrooms/${classroomId}`);
    return resource;
  });
}

export async function deleteClassroomResourceAction(
  input: DeleteClassroomResourceSchema
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new DeleteClassroomResourceCommand(input, context);
    await cmd.run();
    revalidatePath(`/classrooms/${input.classroomId}`);
  });
}
