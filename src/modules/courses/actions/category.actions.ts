"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization } from "@/server/auth/context";
import { CreateCourseCategoryCommand } from "@/modules/courses/commands/create-category.command";
import { UpdateCourseCategoryCommand } from "@/modules/courses/commands/update-category.command";
import { ArchiveCourseCategoryCommand } from "@/modules/courses/commands/archive-category.command";
import { SoftDeleteCourseCategoryCommand } from "@/modules/courses/commands/delete-category.command";
import type {
  CreateCourseCategorySchema,
  UpdateCourseCategorySchema,
} from "@/modules/courses/schemas/category.schema";
import type { ActionResult } from "@/shared/types/common";
import type { CourseCategory } from "@/modules/courses/types";

export async function createCourseCategoryAction(
  input: CreateCourseCategorySchema
): Promise<ActionResult<CourseCategory>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new CreateCourseCategoryCommand(input, context);
    const category = await cmd.run();
    revalidatePath("/courses/categories");
    return category;
  });
}

export async function updateCourseCategoryAction(
  categoryId: string,
  input: UpdateCourseCategorySchema
): Promise<ActionResult<CourseCategory>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new UpdateCourseCategoryCommand({ categoryId, ...input }, context);
    const category = await cmd.run();
    revalidatePath("/courses/categories");
    return category;
  });
}

export async function archiveCourseCategoryAction(
  categoryId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new ArchiveCourseCategoryCommand({ categoryId }, context);
    await cmd.run();
    revalidatePath("/courses/categories");
  });
}

export async function deleteCourseCategoryAction(
  categoryId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new SoftDeleteCourseCategoryCommand({ categoryId }, context);
    await cmd.run();
    revalidatePath("/courses/categories");
  });
}
