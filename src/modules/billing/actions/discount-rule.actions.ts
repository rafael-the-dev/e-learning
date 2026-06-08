"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization } from "@/server/auth/context";
import { CreateDiscountRuleCommand } from "@/modules/billing/commands/create-discount-rule.command";
import { UpdateDiscountRuleCommand } from "@/modules/billing/commands/update-discount-rule.command";
import { ArchiveDiscountRuleCommand } from "@/modules/billing/commands/archive-discount-rule.command";
import type { CreateDiscountRuleSchema, UpdateDiscountRuleSchema } from "@/modules/billing/schemas/discount-rule.schema";
import type { ActionResult } from "@/shared/types/common";
import type { DiscountRule } from "@/modules/billing/types";

export async function createDiscountRuleAction(
  input: CreateDiscountRuleSchema
): Promise<ActionResult<DiscountRule>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new CreateDiscountRuleCommand(input, context);
    const discount = await cmd.run();
    revalidatePath("/settings/billing/discounts");
    return discount;
  });
}

export async function updateDiscountRuleAction(
  input: UpdateDiscountRuleSchema
): Promise<ActionResult<DiscountRule>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new UpdateDiscountRuleCommand(input, context);
    const discount = await cmd.run();
    revalidatePath("/settings/billing/discounts");
    return discount;
  });
}

export async function archiveDiscountRuleAction(
  discountRuleId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new ArchiveDiscountRuleCommand({ discountRuleId }, context);
    await cmd.run();
    revalidatePath("/settings/billing/discounts");
  });
}
