"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization } from "@/server/auth/context";
import { CreateLessonAttachmentCommand } from "@/modules/lessons/commands/create-lesson-attachment.command";
import { UpdateLessonAttachmentCommand } from "@/modules/lessons/commands/update-lesson-attachment.command";
import { DeleteLessonAttachmentCommand } from "@/modules/lessons/commands/delete-lesson-attachment.command";
import type {
  CreateLessonAttachmentSchema,
  UpdateLessonAttachmentSchema,
} from "@/modules/lessons/schemas/lesson-attachment.schema";
import type { ActionResult } from "@/shared/types/common";
import type { LessonAttachment } from "@/modules/lessons/types";

export async function createLessonAttachmentAction(
  input: CreateLessonAttachmentSchema
): Promise<ActionResult<LessonAttachment>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new CreateLessonAttachmentCommand(input, context);
    const attachment = await cmd.run();
    revalidatePath(`/lessons/${input.lessonId}`);
    return attachment;
  });
}

export async function updateLessonAttachmentAction(
  input: UpdateLessonAttachmentSchema
): Promise<ActionResult<LessonAttachment>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new UpdateLessonAttachmentCommand(input, context);
    const attachment = await cmd.run();
    revalidatePath(`/lessons/${input.lessonId}`);
    return attachment;
  });
}

export async function deleteLessonAttachmentAction(
  attachmentId: string,
  lessonId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new DeleteLessonAttachmentCommand({ attachmentId, lessonId }, context);
    await cmd.run();
    revalidatePath(`/lessons/${lessonId}`);
  });
}
