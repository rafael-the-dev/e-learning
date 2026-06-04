"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization } from "@/server/auth/context";
import { CreateCourseLevelCommand } from "@/modules/courses/commands/create-level.command";
import { UpdateCourseLevelCommand } from "@/modules/courses/commands/update-level.command";
import { ArchiveCourseLevelCommand } from "@/modules/courses/commands/archive-level.command";
import { DeleteCourseLevelCommand } from "@/modules/courses/commands/delete-level.command";
import { ReorderCourseLevelsCommand } from "@/modules/courses/commands/reorder-levels.command";
import type {
  CreateCourseLevelSchema,
  UpdateCourseLevelSchema,
  ReorderCourseLevelsSchema,
} from "@/modules/courses/schemas/level.schema";
import type { ActionResult } from "@/shared/types/common";
import type { CourseLevel } from "@/modules/courses/types";

export async function createCourseLevelAction(
  courseId: string,
  input: CreateCourseLevelSchema
): Promise<ActionResult<CourseLevel>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new CreateCourseLevelCommand({ ...input, courseId }, context);
    const level = await cmd.run();
    revalidatePath(`/courses/${courseId}`);
    revalidatePath(`/courses/${courseId}/levels`);
    return level;
  });
}

export async function updateCourseLevelAction(
  courseId: string,
  levelId: string,
  input: UpdateCourseLevelSchema
): Promise<ActionResult<CourseLevel>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new UpdateCourseLevelCommand(
      { levelId, courseId, ...input },
      context
    );
    const level = await cmd.run();
    revalidatePath(`/courses/${courseId}`);
    revalidatePath(`/courses/${courseId}/levels`);
    return level;
  });
}

export async function archiveCourseLevelAction(
  courseId: string,
  levelId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new ArchiveCourseLevelCommand({ levelId, courseId }, context);
    await cmd.run();
    revalidatePath(`/courses/${courseId}`);
    revalidatePath(`/courses/${courseId}/levels`);
  });
}

export async function deleteCourseLevelAction(
  courseId: string,
  levelId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new DeleteCourseLevelCommand({ levelId, courseId }, context);
    await cmd.run();
    revalidatePath(`/courses/${courseId}`);
    revalidatePath(`/courses/${courseId}/levels`);
  });
}

export async function reorderCourseLevelsAction(
  input: ReorderCourseLevelsSchema
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new ReorderCourseLevelsCommand(input, context);
    await cmd.run();
    revalidatePath(`/courses/${input.courseId}`);
    revalidatePath(`/courses/${input.courseId}/levels`);
  });
}
