"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization } from "@/server/auth/context";
import { CreateBillingPolicyCommand } from "@/modules/billing/commands/create-billing-policy.command";
import { UpdateBillingPolicyCommand } from "@/modules/billing/commands/update-billing-policy.command";
import { ArchiveBillingPolicyCommand } from "@/modules/billing/commands/archive-billing-policy.command";
import { SetDefaultBillingPolicyCommand } from "@/modules/billing/commands/set-default-billing-policy.command";
import { AddPolicyFeeCommand } from "@/modules/billing/commands/add-policy-fee.command";
import { UpdatePolicyFeeCommand } from "@/modules/billing/commands/update-policy-fee.command";
import { RemovePolicyFeeCommand } from "@/modules/billing/commands/remove-policy-fee.command";
import { findDefaultBillingPolicy } from "@/modules/billing/repositories/billing-policy.repository";
import { findActiveDiscountRules } from "@/modules/billing/repositories/discount-rule.repository";
import { findActiveTaxRules } from "@/modules/billing/repositories/tax-rule.repository";
import { calculateBilling } from "@/modules/billing/services/billing-calculator.service";
import { getDb } from "@/server/db";
import type { CreateBillingPolicySchema, UpdateBillingPolicySchema } from "@/modules/billing/schemas/billing-policy.schema";
import type { AddPolicyFeeSchema, UpdatePolicyFeeSchema } from "@/modules/billing/schemas/policy-fee.schema";
import type { ActionResult } from "@/shared/types/common";
import type { EnrollmentBillingPolicy, PolicyFee, BillingCalculationResult } from "@/modules/billing/types";

export async function createBillingPolicyAction(
  input: CreateBillingPolicySchema
): Promise<ActionResult<EnrollmentBillingPolicy>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new CreateBillingPolicyCommand(input, context);
    const policy = await cmd.run();
    revalidatePath("/settings/billing/policies");
    return policy;
  });
}

export async function updateBillingPolicyAction(
  input: UpdateBillingPolicySchema
): Promise<ActionResult<EnrollmentBillingPolicy>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new UpdateBillingPolicyCommand(input, context);
    const policy = await cmd.run();
    revalidatePath("/settings/billing/policies");
    revalidatePath(`/settings/billing/policies/${input.policyId}`);
    return policy;
  });
}

export async function archiveBillingPolicyAction(
  policyId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new ArchiveBillingPolicyCommand({ policyId }, context);
    await cmd.run();
    revalidatePath("/settings/billing/policies");
  });
}

export async function setDefaultBillingPolicyAction(
  policyId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new SetDefaultBillingPolicyCommand({ policyId }, context);
    await cmd.run();
    revalidatePath("/settings/billing/policies");
  });
}

export async function addPolicyFeeAction(
  input: AddPolicyFeeSchema
): Promise<ActionResult<PolicyFee>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new AddPolicyFeeCommand(input, context);
    const fee = await cmd.run();
    revalidatePath(`/settings/billing/policies/${input.policyId}`);
    return fee;
  });
}

export async function updatePolicyFeeAction(
  input: UpdatePolicyFeeSchema
): Promise<ActionResult<PolicyFee>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new UpdatePolicyFeeCommand(input, context);
    const fee = await cmd.run();
    revalidatePath(`/settings/billing/policies/${input.policyId}`);
    return fee;
  });
}

export async function removePolicyFeeAction(
  policyFeeId: string,
  policyId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new RemovePolicyFeeCommand({ policyFeeId, policyId }, context);
    await cmd.run();
    revalidatePath(`/settings/billing/policies/${policyId}`);
  });
}

// Returns a billing preview for the given course using the org's default active policy.
// Called from the enrollment creation form to show the estimated invoice before submitting.
export async function getBillingPreviewAction(
  courseId: string
): Promise<ActionResult<BillingCalculationResult | null>> {
  return runAction(async () => {
    const context = await requireOrganization();

    const policy = await findDefaultBillingPolicy(context.organizationId);
    if (!policy || !policy.autoGenerateInvoiceOnEnrollment) return null;

    const db = await getDb();
    const course = await db.course.findFirst({
      where: { id: courseId, organizationId: context.organizationId, deletedAt: null },
      select: { price: true },
    });
    if (!course) return null;

    const courseBasePrice = course.price
      ? (course.price as { toNumber(): number }).toNumber()
      : 0;

    const [discounts, taxes] = await Promise.all([
      findActiveDiscountRules(context.organizationId),
      findActiveTaxRules(context.organizationId),
    ]);

    return calculateBilling(policy, courseBasePrice, discounts, taxes);
  });
}
