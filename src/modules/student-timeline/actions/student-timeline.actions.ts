"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization } from "@/server/auth/context";
import { CreateStudentTimelineManualNoteCommand } from "@/modules/student-timeline/commands/create-student-timeline-manual-note.command";
import { DeleteStudentTimelineManualNoteCommand } from "@/modules/student-timeline/commands/delete-student-timeline-manual-note.command";
import type { CreateManualNoteSchema } from "@/modules/student-timeline/schemas/student-timeline.schema";
import type { ActionResult } from "@/shared/types/common";
import type { StudentTimelineEvent } from "@/modules/student-timeline/types";

export async function createManualNoteAction(
  input: CreateManualNoteSchema
): Promise<ActionResult<StudentTimelineEvent>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new CreateStudentTimelineManualNoteCommand(input, context);
    const event = await cmd.run();
    revalidatePath(`/students/${input.studentId}/timeline`);
    revalidatePath(`/students/${input.studentId}`);
    return event;
  });
}

export async function deleteManualNoteAction(
  eventId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new DeleteStudentTimelineManualNoteCommand({ eventId }, context);
    const studentId = await cmd.run();
    revalidatePath(`/students/${studentId}/timeline`);
    revalidatePath(`/students/${studentId}`);
  });
}
