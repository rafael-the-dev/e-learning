"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization } from "@/server/auth/context";
import { AssignSubjectToLevelCommand } from "@/modules/courses/commands/assign-subject-to-level.command";
import { UpdateLevelSubjectCommand } from "@/modules/courses/commands/update-level-subject.command";
import { RemoveSubjectFromLevelCommand } from "@/modules/courses/commands/remove-subject-from-level.command";
import { ReorderLevelSubjectsCommand } from "@/modules/courses/commands/reorder-level-subjects.command";
import type {
  AssignSubjectSchema,
  UpdateLevelSubjectSchema,
  ReorderLevelSubjectsSchema,
} from "@/modules/courses/schemas/level-subject.schema";
import type { ActionResult } from "@/shared/types/common";
import type { LevelSubject } from "@/modules/courses/types";

export async function assignSubjectToLevelAction(
  courseId: string,
  courseLevelId: string,
  input: AssignSubjectSchema
): Promise<ActionResult<LevelSubject>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new AssignSubjectToLevelCommand(
      { courseId, courseLevelId, ...input },
      context
    );
    const levelSubject = await cmd.run();
    revalidatePath(`/courses/${courseId}/levels/${courseLevelId}`);
    return levelSubject;
  });
}

export async function updateLevelSubjectAction(
  courseId: string,
  courseLevelId: string,
  levelSubjectId: string,
  input: UpdateLevelSubjectSchema
): Promise<ActionResult<LevelSubject>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new UpdateLevelSubjectCommand(
      { levelSubjectId, ...input },
      context
    );
    const levelSubject = await cmd.run();
    revalidatePath(`/courses/${courseId}/levels/${courseLevelId}`);
    return levelSubject;
  });
}

export async function removeSubjectFromLevelAction(
  courseId: string,
  courseLevelId: string,
  levelSubjectId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new RemoveSubjectFromLevelCommand({ levelSubjectId }, context);
    await cmd.run();
    revalidatePath(`/courses/${courseId}/levels/${courseLevelId}`);
  });
}

export async function reorderLevelSubjectsAction(
  courseId: string,
  courseLevelId: string,
  input: ReorderLevelSubjectsSchema
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new ReorderLevelSubjectsCommand(
      { courseLevelId, ...input },
      context
    );
    await cmd.run();
    revalidatePath(`/courses/${courseId}/levels/${courseLevelId}`);
  });
}
