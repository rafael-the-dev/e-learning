"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization } from "@/server/auth/context";
import { AddClassroomFeatureCommand } from "@/modules/classrooms/commands/add-classroom-feature.command";
import { RemoveClassroomFeatureCommand } from "@/modules/classrooms/commands/remove-classroom-feature.command";
import type { AddClassroomFeatureSchema, RemoveClassroomFeatureSchema } from "@/modules/classrooms/schemas/classroom-feature.schema";
import type { ActionResult } from "@/shared/types/common";
import type { ClassroomFeature } from "@/modules/classrooms/types";

export async function addClassroomFeatureAction(
  input: AddClassroomFeatureSchema
): Promise<ActionResult<ClassroomFeature>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new AddClassroomFeatureCommand(input, context);
    const feature = await cmd.run();
    revalidatePath(`/classrooms/${input.classroomId}`);
    return feature;
  });
}

export async function removeClassroomFeatureAction(
  input: RemoveClassroomFeatureSchema
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new RemoveClassroomFeatureCommand(input, context);
    await cmd.run();
    revalidatePath(`/classrooms/${input.classroomId}`);
  });
}
