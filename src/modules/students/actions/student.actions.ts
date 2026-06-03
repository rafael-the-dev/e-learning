"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization } from "@/server/auth/context";
import { CreateStudentCommand } from "@/modules/students/commands/create-student.command";
import { UpdateStudentCommand } from "@/modules/students/commands/update-student.command";
import { SuspendStudentCommand } from "@/modules/students/commands/suspend-student.command";
import { SoftDeleteStudentCommand } from "@/modules/students/commands/delete-student.command";
import type {
  CreateStudentSchema,
  UpdateStudentSchema,
} from "@/modules/students/schemas/student.schema";
import type { ActionResult } from "@/shared/types/common";
import type { Student } from "@/modules/students/types";

export async function createStudentAction(
  input: CreateStudentSchema
): Promise<ActionResult<Student>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new CreateStudentCommand(input, context);
    const student = await cmd.run();
    revalidatePath("/students");
    return student;
  });
}

export async function updateStudentAction(
  studentId: string,
  input: UpdateStudentSchema
): Promise<ActionResult<Student>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new UpdateStudentCommand({ studentId, ...input }, context);
    const student = await cmd.run();
    revalidatePath("/students");
    revalidatePath(`/students/${studentId}`);
    return student;
  });
}

export async function suspendStudentAction(
  studentId: string,
  reason?: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new SuspendStudentCommand({ studentId, reason }, context);
    await cmd.run();
    revalidatePath("/students");
    revalidatePath(`/students/${studentId}`);
  });
}

export async function deleteStudentAction(
  studentId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new SoftDeleteStudentCommand({ studentId }, context);
    await cmd.run();
    revalidatePath("/students");
  });
}
