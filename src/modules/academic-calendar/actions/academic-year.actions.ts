"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization } from "@/server/auth/context";
import { CreateAcademicYearCommand } from "@/modules/academic-calendar/commands/create-academic-year.command";
import { UpdateAcademicYearCommand } from "@/modules/academic-calendar/commands/update-academic-year.command";
import { SetDefaultAcademicYearCommand } from "@/modules/academic-calendar/commands/set-default-academic-year.command";
import { ArchiveAcademicYearCommand } from "@/modules/academic-calendar/commands/archive-academic-year.command";
import { SoftDeleteAcademicYearCommand } from "@/modules/academic-calendar/commands/delete-academic-year.command";
import type {
  CreateAcademicYearSchema,
  UpdateAcademicYearSchema,
} from "@/modules/academic-calendar/schemas/academic-year.schema";
import type { ActionResult } from "@/shared/types/common";
import type { AcademicYear } from "@/modules/academic-calendar/types";

export async function createAcademicYearAction(
  input: CreateAcademicYearSchema
): Promise<ActionResult<AcademicYear>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new CreateAcademicYearCommand(input, context);
    const year = await cmd.run();
    revalidatePath("/academic-calendar");
    revalidatePath("/academic-calendar/years");
    return year;
  });
}

export async function updateAcademicYearAction(
  academicYearId: string,
  input: UpdateAcademicYearSchema
): Promise<ActionResult<AcademicYear>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new UpdateAcademicYearCommand({ academicYearId, ...input }, context);
    const year = await cmd.run();
    revalidatePath("/academic-calendar");
    revalidatePath("/academic-calendar/years");
    revalidatePath(`/academic-calendar/years/${academicYearId}`);
    return year;
  });
}

export async function setDefaultAcademicYearAction(
  academicYearId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new SetDefaultAcademicYearCommand({ academicYearId }, context);
    await cmd.run();
    revalidatePath("/academic-calendar");
    revalidatePath("/academic-calendar/years");
  });
}

export async function archiveAcademicYearAction(
  academicYearId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new ArchiveAcademicYearCommand({ academicYearId }, context);
    await cmd.run();
    revalidatePath("/academic-calendar");
    revalidatePath("/academic-calendar/years");
  });
}

export async function deleteAcademicYearAction(
  academicYearId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new SoftDeleteAcademicYearCommand({ academicYearId }, context);
    await cmd.run();
    revalidatePath("/academic-calendar");
    revalidatePath("/academic-calendar/years");
  });
}
