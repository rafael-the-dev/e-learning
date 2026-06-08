"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization } from "@/server/auth/context";
import { CreateTaxRuleCommand } from "@/modules/billing/commands/create-tax-rule.command";
import { UpdateTaxRuleCommand } from "@/modules/billing/commands/update-tax-rule.command";
import { ArchiveTaxRuleCommand } from "@/modules/billing/commands/archive-tax-rule.command";
import type { CreateTaxRuleSchema, UpdateTaxRuleSchema } from "@/modules/billing/schemas/tax-rule.schema";
import type { ActionResult } from "@/shared/types/common";
import type { TaxRule } from "@/modules/billing/types";

export async function createTaxRuleAction(
  input: CreateTaxRuleSchema
): Promise<ActionResult<TaxRule>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new CreateTaxRuleCommand(input, context);
    const tax = await cmd.run();
    revalidatePath("/settings/billing/taxes");
    return tax;
  });
}

export async function updateTaxRuleAction(
  input: UpdateTaxRuleSchema
): Promise<ActionResult<TaxRule>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new UpdateTaxRuleCommand(input, context);
    const tax = await cmd.run();
    revalidatePath("/settings/billing/taxes");
    return tax;
  });
}

export async function archiveTaxRuleAction(
  taxRuleId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new ArchiveTaxRuleCommand({ taxRuleId }, context);
    await cmd.run();
    revalidatePath("/settings/billing/taxes");
  });
}
