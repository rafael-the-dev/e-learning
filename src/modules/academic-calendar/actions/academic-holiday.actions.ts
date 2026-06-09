"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization } from "@/server/auth/context";
import { CreateAcademicHolidayCommand } from "@/modules/academic-calendar/commands/create-academic-holiday.command";
import {
  UpdateAcademicHolidayCommand,
  ArchiveAcademicHolidayCommand,
  SoftDeleteAcademicHolidayCommand,
} from "@/modules/academic-calendar/commands/update-academic-holiday.command";
import type {
  CreateAcademicHolidaySchema,
  UpdateAcademicHolidaySchema,
} from "@/modules/academic-calendar/schemas/academic-holiday.schema";
import type { ActionResult } from "@/shared/types/common";
import type { AcademicHoliday } from "@/modules/academic-calendar/types";

export async function createAcademicHolidayAction(
  input: CreateAcademicHolidaySchema
): Promise<ActionResult<AcademicHoliday>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new CreateAcademicHolidayCommand(input, context);
    const holiday = await cmd.run();
    revalidatePath("/academic-calendar");
    revalidatePath("/academic-calendar/holidays");
    return holiday;
  });
}

export async function updateAcademicHolidayAction(
  academicHolidayId: string,
  input: UpdateAcademicHolidaySchema
): Promise<ActionResult<AcademicHoliday>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new UpdateAcademicHolidayCommand({ academicHolidayId, ...input }, context);
    const holiday = await cmd.run();
    revalidatePath("/academic-calendar");
    revalidatePath("/academic-calendar/holidays");
    return holiday;
  });
}

export async function archiveAcademicHolidayAction(
  academicHolidayId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new ArchiveAcademicHolidayCommand({ academicHolidayId }, context);
    await cmd.run();
    revalidatePath("/academic-calendar");
    revalidatePath("/academic-calendar/holidays");
  });
}

export async function deleteAcademicHolidayAction(
  academicHolidayId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new SoftDeleteAcademicHolidayCommand({ academicHolidayId }, context);
    await cmd.run();
    revalidatePath("/academic-calendar");
    revalidatePath("/academic-calendar/holidays");
  });
}
