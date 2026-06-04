"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization } from "@/server/auth/context";
import { CreateClassGroupCommand } from "@/modules/class-groups/commands/create-class-group.command";
import { UpdateClassGroupCommand } from "@/modules/class-groups/commands/update-class-group.command";
import { ArchiveClassGroupCommand } from "@/modules/class-groups/commands/archive-class-group.command";
import { SoftDeleteClassGroupCommand } from "@/modules/class-groups/commands/delete-class-group.command";
import type {
  CreateClassGroupSchema,
  UpdateClassGroupSchema,
} from "@/modules/class-groups/schemas/class-group.schema";
import type { ActionResult } from "@/shared/types/common";
import type { ClassGroup } from "@/modules/class-groups/types";

export async function createClassGroupAction(
  input: CreateClassGroupSchema
): Promise<ActionResult<ClassGroup>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new CreateClassGroupCommand(input, context);
    const group = await cmd.run();
    revalidatePath("/class-groups");
    return group;
  });
}

export async function updateClassGroupAction(
  classGroupId: string,
  input: UpdateClassGroupSchema
): Promise<ActionResult<ClassGroup>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new UpdateClassGroupCommand({ classGroupId, ...input }, context);
    const group = await cmd.run();
    revalidatePath("/class-groups");
    revalidatePath(`/class-groups/${classGroupId}`);
    return group;
  });
}

export async function archiveClassGroupAction(
  classGroupId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new ArchiveClassGroupCommand({ classGroupId }, context);
    await cmd.run();
    revalidatePath("/class-groups");
    revalidatePath(`/class-groups/${classGroupId}`);
  });
}

export async function deleteClassGroupAction(
  classGroupId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new SoftDeleteClassGroupCommand({ classGroupId }, context);
    await cmd.run();
    revalidatePath("/class-groups");
  });
}
