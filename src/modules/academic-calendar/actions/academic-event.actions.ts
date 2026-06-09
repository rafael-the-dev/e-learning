"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization } from "@/server/auth/context";
import { CreateAcademicEventCommand } from "@/modules/academic-calendar/commands/create-academic-event.command";
import {
  UpdateAcademicEventCommand,
  ArchiveAcademicEventCommand,
  SoftDeleteAcademicEventCommand,
} from "@/modules/academic-calendar/commands/update-academic-event.command";
import type {
  CreateAcademicEventSchema,
  UpdateAcademicEventSchema,
} from "@/modules/academic-calendar/schemas/academic-event.schema";
import type { ActionResult } from "@/shared/types/common";
import type { AcademicEvent } from "@/modules/academic-calendar/types";

export async function createAcademicEventAction(
  input: CreateAcademicEventSchema
): Promise<ActionResult<AcademicEvent>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new CreateAcademicEventCommand(input, context);
    const event = await cmd.run();
    revalidatePath("/academic-calendar");
    revalidatePath("/academic-calendar/events");
    return event;
  });
}

export async function updateAcademicEventAction(
  academicEventId: string,
  input: UpdateAcademicEventSchema
): Promise<ActionResult<AcademicEvent>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new UpdateAcademicEventCommand({ academicEventId, ...input }, context);
    const event = await cmd.run();
    revalidatePath("/academic-calendar");
    revalidatePath("/academic-calendar/events");
    return event;
  });
}

export async function archiveAcademicEventAction(
  academicEventId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new ArchiveAcademicEventCommand({ academicEventId }, context);
    await cmd.run();
    revalidatePath("/academic-calendar");
    revalidatePath("/academic-calendar/events");
  });
}

export async function deleteAcademicEventAction(
  academicEventId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new SoftDeleteAcademicEventCommand({ academicEventId }, context);
    await cmd.run();
    revalidatePath("/academic-calendar");
    revalidatePath("/academic-calendar/events");
  });
}
