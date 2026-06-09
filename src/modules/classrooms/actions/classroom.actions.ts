"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization } from "@/server/auth/context";
import { CreateClassroomCommand } from "@/modules/classrooms/commands/create-classroom.command";
import { UpdateClassroomCommand } from "@/modules/classrooms/commands/update-classroom.command";
import { ArchiveClassroomCommand } from "@/modules/classrooms/commands/archive-classroom.command";
import type { CreateClassroomSchema, UpdateClassroomSchema } from "@/modules/classrooms/schemas/classroom.schema";
import type { ActionResult } from "@/shared/types/common";
import type { Classroom } from "@/modules/classrooms/types";

export async function createClassroomAction(
  input: CreateClassroomSchema
): Promise<ActionResult<Classroom>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new CreateClassroomCommand(input, context);
    const classroom = await cmd.run();
    revalidatePath("/classrooms");
    return classroom;
  });
}

export async function updateClassroomAction(
  classroomId: string,
  input: UpdateClassroomSchema
): Promise<ActionResult<Classroom>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new UpdateClassroomCommand({ classroomId, ...input }, context);
    const classroom = await cmd.run();
    revalidatePath("/classrooms");
    revalidatePath(`/classrooms/${classroomId}`);
    return classroom;
  });
}

export async function archiveClassroomAction(
  classroomId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new ArchiveClassroomCommand({ classroomId }, context);
    await cmd.run();
    revalidatePath("/classrooms");
    revalidatePath(`/classrooms/${classroomId}`);
  });
}
