"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization } from "@/server/auth/context";
import { CreateTeacherCommand } from "@/modules/teachers/commands/create-teacher.command";
import { UpdateTeacherCommand } from "@/modules/teachers/commands/update-teacher.command";
import { SuspendTeacherCommand } from "@/modules/teachers/commands/suspend-teacher.command";
import { SoftDeleteTeacherCommand } from "@/modules/teachers/commands/delete-teacher.command";
import { AssignTeacherSubjectCommand } from "@/modules/teachers/commands/assign-subject.command";
import { RemoveTeacherSubjectCommand } from "@/modules/teachers/commands/remove-subject.command";
import type {
  CreateTeacherSchema,
  UpdateTeacherSchema,
} from "@/modules/teachers/schemas/teacher.schema";
import type { ActionResult } from "@/shared/types/common";
import type { Teacher } from "@/modules/teachers/types";

export async function createTeacherAction(
  input: CreateTeacherSchema
): Promise<ActionResult<Teacher>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new CreateTeacherCommand(input, context);
    const teacher = await cmd.run();
    revalidatePath("/teachers");
    return teacher;
  });
}

export async function updateTeacherAction(
  teacherId: string,
  input: UpdateTeacherSchema
): Promise<ActionResult<Teacher>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new UpdateTeacherCommand({ teacherId, ...input }, context);
    const teacher = await cmd.run();
    revalidatePath("/teachers");
    revalidatePath(`/teachers/${teacherId}`);
    return teacher;
  });
}

export async function suspendTeacherAction(
  teacherId: string,
  reason?: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new SuspendTeacherCommand({ teacherId, reason }, context);
    await cmd.run();
    revalidatePath("/teachers");
    revalidatePath(`/teachers/${teacherId}`);
  });
}

export async function deleteTeacherAction(
  teacherId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new SoftDeleteTeacherCommand({ teacherId }, context);
    await cmd.run();
    revalidatePath("/teachers");
  });
}

export async function assignTeacherSubjectAction(
  teacherId: string,
  subjectId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new AssignTeacherSubjectCommand({ teacherId, subjectId }, context);
    await cmd.run();
    revalidatePath(`/teachers/${teacherId}`);
  });
}

export async function removeTeacherSubjectAction(
  teacherId: string,
  subjectId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new RemoveTeacherSubjectCommand({ teacherId, subjectId }, context);
    await cmd.run();
    revalidatePath(`/teachers/${teacherId}`);
  });
}
