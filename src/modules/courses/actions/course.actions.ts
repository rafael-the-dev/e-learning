"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization } from "@/server/auth/context";
import { CreateCourseCommand } from "@/modules/courses/commands/create-course.command";
import { UpdateCourseCommand } from "@/modules/courses/commands/update-course.command";
import { ArchiveCourseCommand } from "@/modules/courses/commands/archive-course.command";
import { SoftDeleteCourseCommand } from "@/modules/courses/commands/delete-course.command";
import type {
  CreateCourseSchema,
  UpdateCourseSchema,
} from "@/modules/courses/schemas/course.schema";
import type { ActionResult } from "@/shared/types/common";
import type { Course } from "@/modules/courses/types";

export async function createCourseAction(
  input: CreateCourseSchema
): Promise<ActionResult<Course>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new CreateCourseCommand(input, context);
    const course = await cmd.run();
    revalidatePath("/courses");
    return course;
  });
}

export async function updateCourseAction(
  courseId: string,
  input: UpdateCourseSchema
): Promise<ActionResult<Course>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new UpdateCourseCommand({ courseId, ...input }, context);
    const course = await cmd.run();
    revalidatePath("/courses");
    revalidatePath(`/courses/${courseId}`);
    return course;
  });
}

export async function archiveCourseAction(
  courseId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new ArchiveCourseCommand({ courseId }, context);
    await cmd.run();
    revalidatePath("/courses");
    revalidatePath(`/courses/${courseId}`);
  });
}

export async function deleteCourseAction(
  courseId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new SoftDeleteCourseCommand({ courseId }, context);
    await cmd.run();
    revalidatePath("/courses");
  });
}
