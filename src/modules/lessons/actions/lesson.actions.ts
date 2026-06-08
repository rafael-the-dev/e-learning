"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization } from "@/server/auth/context";
import { CreateLessonCommand } from "@/modules/lessons/commands/create-lesson.command";
import { UpdateLessonCommand } from "@/modules/lessons/commands/update-lesson.command";
import { PublishLessonCommand } from "@/modules/lessons/commands/publish-lesson.command";
import { ArchiveLessonCommand } from "@/modules/lessons/commands/archive-lesson.command";
import { SoftDeleteLessonCommand } from "@/modules/lessons/commands/soft-delete-lesson.command";
import type { CreateLessonSchema, UpdateLessonSchema } from "@/modules/lessons/schemas/lesson.schema";
import type { ActionResult } from "@/shared/types/common";
import type { Lesson } from "@/modules/lessons/types";

export async function createLessonAction(
  input: CreateLessonSchema
): Promise<ActionResult<Lesson>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new CreateLessonCommand(input, context);
    const lesson = await cmd.run();
    revalidatePath("/lessons");
    return lesson;
  });
}

export async function updateLessonAction(
  input: UpdateLessonSchema
): Promise<ActionResult<Lesson>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new UpdateLessonCommand(input, context);
    const lesson = await cmd.run();
    revalidatePath("/lessons");
    revalidatePath(`/lessons/${input.lessonId}`);
    return lesson;
  });
}

export async function publishLessonAction(
  lessonId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new PublishLessonCommand({ lessonId }, context);
    await cmd.run();
    revalidatePath("/lessons");
    revalidatePath(`/lessons/${lessonId}`);
  });
}

export async function archiveLessonAction(
  lessonId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new ArchiveLessonCommand({ lessonId }, context);
    await cmd.run();
    revalidatePath("/lessons");
    revalidatePath(`/lessons/${lessonId}`);
  });
}

export async function deleteLessonAction(
  lessonId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new SoftDeleteLessonCommand({ lessonId }, context);
    await cmd.run();
    revalidatePath("/lessons");
  });
}
