"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization } from "@/server/auth/context";
import { CreateStudentDocumentCommand } from "@/modules/student-documents/commands/create-student-document.command";
import { DeleteStudentDocumentCommand } from "@/modules/student-documents/commands/delete-student-document.command";
import { VerifyStudentDocumentCommand } from "@/modules/student-documents/commands/verify-student-document.command";
import type {
  CreateStudentDocumentSchema,
  VerifyStudentDocumentSchema,
} from "@/modules/student-documents/schemas/student-document.schema";
import type { ActionResult } from "@/shared/types/common";
import type { StudentDocument } from "@/modules/student-documents/types";

export async function createStudentDocumentAction(
  input: CreateStudentDocumentSchema
): Promise<ActionResult<StudentDocument>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new CreateStudentDocumentCommand(input, context);
    const document = await cmd.run();
    revalidatePath(`/students/${input.studentId}`);
    return document;
  });
}

export async function deleteStudentDocumentAction(
  documentId: string,
  studentId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new DeleteStudentDocumentCommand({ documentId, studentId }, context);
    await cmd.run();
    revalidatePath(`/students/${studentId}`);
  });
}

export async function verifyStudentDocumentAction(
  input: VerifyStudentDocumentSchema
): Promise<ActionResult<StudentDocument>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new VerifyStudentDocumentCommand(input, context);
    const document = await cmd.run();
    revalidatePath(`/students/${input.studentId}`);
    return document;
  });
}
