"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization } from "@/server/auth/context";
import { CreateSubjectCommand } from "@/modules/courses/commands/create-subject.command";
import { UpdateSubjectCommand } from "@/modules/courses/commands/update-subject.command";
import { ArchiveSubjectCommand } from "@/modules/courses/commands/archive-subject.command";
import { DeleteSubjectCommand } from "@/modules/courses/commands/delete-subject.command";
import type {
  CreateSubjectSchema,
  UpdateSubjectSchema,
} from "@/modules/courses/schemas/subject.schema";
import type { ActionResult } from "@/shared/types/common";
import type { Subject } from "@/modules/courses/types";

export async function createSubjectAction(
  courseId: string,
  input: CreateSubjectSchema
): Promise<ActionResult<Subject>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new CreateSubjectCommand({ ...input, courseId }, context);
    const subject = await cmd.run();
    revalidatePath(`/courses/${courseId}/subjects`);
    revalidatePath(`/courses/${courseId}`);
    return subject;
  });
}

export async function updateSubjectAction(
  courseId: string,
  subjectId: string,
  input: UpdateSubjectSchema
): Promise<ActionResult<Subject>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new UpdateSubjectCommand(
      { subjectId, courseId, ...input },
      context
    );
    const subject = await cmd.run();
    revalidatePath(`/courses/${courseId}/subjects`);
    return subject;
  });
}

export async function archiveSubjectAction(
  courseId: string,
  subjectId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new ArchiveSubjectCommand({ subjectId, courseId }, context);
    await cmd.run();
    revalidatePath(`/courses/${courseId}/subjects`);
  });
}

export async function deleteSubjectAction(
  courseId: string,
  subjectId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new DeleteSubjectCommand({ subjectId, courseId }, context);
    await cmd.run();
    revalidatePath(`/courses/${courseId}/subjects`);
  });
}
