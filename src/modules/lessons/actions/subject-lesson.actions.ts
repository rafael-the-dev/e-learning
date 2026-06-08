"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization } from "@/server/auth/context";
import { AssignLessonToSubjectCommand } from "@/modules/lessons/commands/assign-lesson-to-subject.command";
import { UpdateSubjectLessonCommand } from "@/modules/lessons/commands/update-subject-lesson.command";
import { RemoveLessonFromSubjectCommand } from "@/modules/lessons/commands/remove-lesson-from-subject.command";
import { ReorderSubjectLessonsCommand } from "@/modules/lessons/commands/reorder-subject-lessons.command";
import type {
  AssignLessonToSubjectSchema,
  UpdateSubjectLessonSchema,
  ReorderSubjectLessonsSchema,
} from "@/modules/lessons/schemas/subject-lesson.schema";
import type { ActionResult } from "@/shared/types/common";
import type { SubjectLesson } from "@/modules/lessons/types";

export async function assignLessonToSubjectAction(
  input: AssignLessonToSubjectSchema
): Promise<ActionResult<SubjectLesson>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new AssignLessonToSubjectCommand(input, context);
    const sl = await cmd.run();
    revalidatePath(`/subjects/${input.subjectId}`);
    return sl;
  });
}

export async function updateSubjectLessonAction(
  input: UpdateSubjectLessonSchema
): Promise<ActionResult<SubjectLesson>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new UpdateSubjectLessonCommand(input, context);
    const sl = await cmd.run();
    revalidatePath(`/subjects/${sl.subjectId}`);
    return sl;
  });
}

export async function removeLessonFromSubjectAction(
  subjectLessonId: string,
  subjectId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new RemoveLessonFromSubjectCommand({ subjectLessonId }, context);
    await cmd.run();
    revalidatePath(`/subjects/${subjectId}`);
  });
}

export async function reorderSubjectLessonsAction(
  input: ReorderSubjectLessonsSchema
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new ReorderSubjectLessonsCommand(input, context);
    await cmd.run();
    revalidatePath(`/subjects/${input.subjectId}`);
  });
}
