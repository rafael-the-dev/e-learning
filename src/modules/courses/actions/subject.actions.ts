"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization } from "@/server/auth/context";
import { CreateSubjectCommand } from "@/modules/courses/commands/create-subject.command";
import { UpdateSubjectCommand } from "@/modules/courses/commands/update-subject.command";
import { ArchiveSubjectCommand } from "@/modules/courses/commands/archive-subject.command";
import { SoftDeleteSubjectCommand } from "@/modules/courses/commands/delete-subject.command";
import type {
  CreateSubjectSchema,
  UpdateSubjectSchema,
} from "@/modules/courses/schemas/subject.schema";
import type { ActionResult } from "@/shared/types/common";
import type { Subject } from "@/modules/courses/types";

export async function createSubjectAction(
  input: CreateSubjectSchema
): Promise<ActionResult<Subject>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new CreateSubjectCommand(input, context);
    const subject = await cmd.run();
    revalidatePath("/subjects");
    return subject;
  });
}

export async function updateSubjectAction(
  subjectId: string,
  input: UpdateSubjectSchema
): Promise<ActionResult<Subject>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new UpdateSubjectCommand({ subjectId, ...input }, context);
    const subject = await cmd.run();
    revalidatePath("/subjects");
    return subject;
  });
}

export async function archiveSubjectAction(
  subjectId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new ArchiveSubjectCommand({ subjectId }, context);
    await cmd.run();
    revalidatePath("/subjects");
  });
}

export async function softDeleteSubjectAction(
  subjectId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new SoftDeleteSubjectCommand({ subjectId }, context);
    await cmd.run();
    revalidatePath("/subjects");
  });
}
