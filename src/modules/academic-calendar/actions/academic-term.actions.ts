"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization } from "@/server/auth/context";
import { CreateAcademicTermCommand } from "@/modules/academic-calendar/commands/create-academic-term.command";
import { UpdateAcademicTermCommand } from "@/modules/academic-calendar/commands/update-academic-term.command";
import {
  ArchiveAcademicTermCommand,
  SoftDeleteAcademicTermCommand,
} from "@/modules/academic-calendar/commands/archive-academic-term.command";
import type {
  CreateAcademicTermSchema,
  UpdateAcademicTermSchema,
} from "@/modules/academic-calendar/schemas/academic-term.schema";
import type { ActionResult } from "@/shared/types/common";
import type { AcademicTerm } from "@/modules/academic-calendar/types";

export async function createAcademicTermAction(
  input: CreateAcademicTermSchema
): Promise<ActionResult<AcademicTerm>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new CreateAcademicTermCommand(input, context);
    const term = await cmd.run();
    revalidatePath("/academic-calendar");
    revalidatePath("/academic-calendar/terms");
    revalidatePath(`/academic-calendar/years/${input.academicYearId}`);
    return term;
  });
}

export async function updateAcademicTermAction(
  academicTermId: string,
  input: UpdateAcademicTermSchema
): Promise<ActionResult<AcademicTerm>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new UpdateAcademicTermCommand({ academicTermId, ...input }, context);
    const term = await cmd.run();
    revalidatePath("/academic-calendar");
    revalidatePath("/academic-calendar/terms");
    return term;
  });
}

export async function archiveAcademicTermAction(
  academicTermId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new ArchiveAcademicTermCommand({ academicTermId }, context);
    await cmd.run();
    revalidatePath("/academic-calendar");
    revalidatePath("/academic-calendar/terms");
  });
}

export async function deleteAcademicTermAction(
  academicTermId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new SoftDeleteAcademicTermCommand({ academicTermId }, context);
    await cmd.run();
    revalidatePath("/academic-calendar");
    revalidatePath("/academic-calendar/terms");
  });
}
