"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization } from "@/server/auth/context";
import { CreateTeacherDocumentCommand } from "@/modules/teacher-documents/commands/create-teacher-document.command";
import { DeleteTeacherDocumentCommand } from "@/modules/teacher-documents/commands/delete-teacher-document.command";
import type { CreateTeacherDocumentSchema } from "@/modules/teacher-documents/schemas/teacher-document.schema";
import type { ActionResult } from "@/shared/types/common";
import type { TeacherDocument } from "@/modules/teacher-documents/types";

export async function createTeacherDocumentAction(
  input: CreateTeacherDocumentSchema
): Promise<ActionResult<TeacherDocument>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new CreateTeacherDocumentCommand(input, context);
    const document = await cmd.run();
    revalidatePath(`/teachers/${input.teacherId}`);
    return document;
  });
}

export async function deleteTeacherDocumentAction(
  documentId: string,
  teacherId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new DeleteTeacherDocumentCommand({ documentId, teacherId }, context);
    await cmd.run();
    revalidatePath(`/teachers/${teacherId}`);
  });
}
