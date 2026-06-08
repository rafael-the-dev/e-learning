import { ITEM_TYPE_PRIORITY } from "@/modules/finance/types";
import type {
  EnrollmentBillingPolicy,
  PolicyFee,
  DiscountRule,
  TaxRule,
  BillingCalculationResult,
  BillingPreviewItem,
  BillingPreviewDiscount,
  BillingPreviewTax,
} from "@/modules/billing/types";

// =============================================================================
// BILLING CALCULATOR SERVICE
// Deterministic, pure calculation — no DB access.
// Called by GenerateInvoiceFromEnrollmentCommand and the enrollment preview API.
// All monetary arithmetic uses integer cents internally to avoid float errors.
// =============================================================================

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

export function calculatePolicyFeeAmount(
  policyFee: PolicyFee,
  courseBasePrice: number
): number {
  switch (policyFee.amountType) {
    case "FIXED":
      return policyFee.fixedAmount ?? policyFee.feeDefinitionDefaultAmount;
    case "COURSE_BASE_PRICE":
      return courseBasePrice;
    case "PERCENTAGE_OF_COURSE_PRICE": {
      const pct = policyFee.percentage ?? 0;
      return fromCents(Math.round((toCents(courseBasePrice) * pct) / 100));
    }
    default:
      return policyFee.feeDefinitionDefaultAmount;
  }
}

export function calculateBilling(
  policy: EnrollmentBillingPolicy,
  courseBasePrice: number,
  activeDiscountRules: DiscountRule[],
  activeTaxRules: TaxRule[]
): BillingCalculationResult {
  // 1. Generate invoice items from active policy fees
  const activeFees = policy.policyFees.filter((f) => f.status === "ACTIVE");
  const items: BillingPreviewItem[] = activeFees.map((pf) => {
    const unitPrice = calculatePolicyFeeAmount(pf, courseBasePrice);
    return {
      feeDefinitionId: pf.feeDefinitionId,
      feeDefinitionCode: pf.feeDefinitionCode,
      description: pf.feeDefinitionName,
      itemType: pf.feeDefinitionType,
      quantity: 1,
      unitPrice,
      totalPrice: unitPrice,
      priority: pf.priority ?? (ITEM_TYPE_PRIORITY[pf.feeDefinitionType] ?? 7),
    };
  });

  // 2. Subtotal = sum of all item totalPrices
  const subtotalCents = items.reduce((acc, item) => acc + toCents(item.totalPrice), 0);
  const subtotal = fromCents(subtotalCents);

  // 3. Apply discount rules
  const discounts: BillingPreviewDiscount[] = [];
  let remainingCents = subtotalCents;

  for (const rule of activeDiscountRules) {
    // Non-stackable: only first discount applied
    if (!rule.stackable && discounts.length > 0) continue;

    let discountCents = 0;
    if (rule.discountType === "PERCENTAGE") {
      discountCents = Math.round((remainingCents * rule.value) / 100);
    } else {
      discountCents = Math.min(toCents(rule.value), remainingCents);
    }

    if (discountCents > 0) {
      discounts.push({
        discountRuleId: rule.id,
        name: rule.name,
        discountType: rule.discountType,
        value: rule.value,
        amount: fromCents(discountCents),
      });
      if (!rule.stackable) break;
      remainingCents -= discountCents;
    }
  }

  const discountAmount = fromCents(discounts.reduce((acc, d) => acc + toCents(d.amount), 0));
  const afterDiscountCents = subtotalCents - toCents(discountAmount);

  // 4. Apply tax rules (only on taxes NOT included in price)
  const taxes: BillingPreviewTax[] = [];
  for (const rule of activeTaxRules) {
    if (rule.isIncludedInPrice) continue;
    const taxCents = Math.round((afterDiscountCents * rule.rate) / 100);
    if (taxCents > 0) {
      taxes.push({
        taxRuleId: rule.id,
        name: rule.name,
        rate: rule.rate,
        amount: fromCents(taxCents),
        isIncludedInPrice: false,
      });
    }
  }

  const taxAmount = fromCents(taxes.reduce((acc, t) => acc + toCents(t.amount), 0));
  const totalAmount = fromCents(afterDiscountCents + toCents(taxAmount));

  // 5. Payment plan preview
  const installmentsPreview: { number: number; amount: number }[] = [];
  if (policy.installmentsRequired && policy.defaultNumberOfInstallments) {
    const n = policy.defaultNumberOfInstallments;
    const baseInstCents = Math.floor((toCents(totalAmount) / n));
    const lastInstCents = toCents(totalAmount) - baseInstCents * (n - 1);
    const minFirst = policy.minimumFirstPaymentAmount;

    for (let i = 0; i < n; i++) {
      let amount: number;
      if (i === 0 && minFirst && toCents(minFirst) > baseInstCents) {
        amount = fromCents(toCents(minFirst));
      } else if (i === n - 1) {
        // Adjust last installment so total adds up
        const paidSoFarCents = installmentsPreview.reduce((acc, inst) => acc + toCents(inst.amount), 0);
        amount = fromCents(toCents(totalAmount) - paidSoFarCents);
      } else {
        amount = fromCents(baseInstCents);
      }
      installmentsPreview.push({ number: i + 1, amount });
    }
  }

  return {
    items,
    discounts,
    taxes,
    subtotal,
    discountAmount,
    taxAmount,
    totalAmount,
    installmentsPreview,
  };
}
