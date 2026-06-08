"use server";

import { runAction } from "@/shared/lib/action";
import { requireOrganization } from "@/server/auth/context";
import { UpdateLessonProgressCommand } from "@/modules/lessons/commands/update-lesson-progress.command";
import type { UpdateLessonProgressSchema } from "@/modules/lessons/schemas/subject-lesson.schema";
import type { ActionResult } from "@/shared/types/common";
import type { StudentLessonProgress } from "@/modules/lessons/types";

export async function updateLessonProgressAction(
  input: UpdateLessonProgressSchema
): Promise<ActionResult<StudentLessonProgress>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new UpdateLessonProgressCommand(input, context);
    return cmd.run();
  });
}
