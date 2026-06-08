"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization } from "@/server/auth/context";
import { CreateFeeDefinitionCommand } from "@/modules/billing/commands/create-fee-definition.command";
import { UpdateFeeDefinitionCommand } from "@/modules/billing/commands/update-fee-definition.command";
import { ArchiveFeeDefinitionCommand } from "@/modules/billing/commands/archive-fee-definition.command";
import type { CreateFeeDefinitionSchema, UpdateFeeDefinitionSchema } from "@/modules/billing/schemas/fee-definition.schema";
import type { ActionResult } from "@/shared/types/common";
import type { FeeDefinition } from "@/modules/billing/types";

export async function createFeeDefinitionAction(
  input: CreateFeeDefinitionSchema
): Promise<ActionResult<FeeDefinition>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new CreateFeeDefinitionCommand(input, context);
    const fee = await cmd.run();
    revalidatePath("/settings/billing/fees");
    return fee;
  });
}

export async function updateFeeDefinitionAction(
  input: UpdateFeeDefinitionSchema
): Promise<ActionResult<FeeDefinition>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new UpdateFeeDefinitionCommand(input, context);
    const fee = await cmd.run();
    revalidatePath("/settings/billing/fees");
    return fee;
  });
}

export async function archiveFeeDefinitionAction(
  feeDefinitionId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new ArchiveFeeDefinitionCommand({ feeDefinitionId }, context);
    await cmd.run();
    revalidatePath("/settings/billing/fees");
  });
}
