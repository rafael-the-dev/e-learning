import { BaseCommand, BusinessRuleError } from "@/shared/lib/command";
import type { PaymentAllocation } from "@/modules/finance/types";
import type { ServiceContext } from "@/shared/types/common";

// =============================================================================
// AllocatePaymentCommand — structure for future manual allocation
//
// Automatic allocation happens inside ConfirmPaymentCommand.
// This command is reserved for manual override: allowing staff to reassign
// which invoice items a payment covers (e.g. move allocation from COURSE_FEE
// to PENALTY after the fact).
//
// Not yet implemented. Allocation is currently automatic by item priority.
// =============================================================================

export interface AllocatePaymentInput {
  paymentId: string;
  allocations: {
    invoiceItemId: string;
    amount: number;
    allocationType: "PAYMENT" | "WALLET_CREDIT" | "ADJUSTMENT";
  }[];
}

export class AllocatePaymentCommand extends BaseCommand<AllocatePaymentInput, PaymentAllocation[]> {
  async validate(): Promise<void> {
    throw new BusinessRuleError("Alocação manual ainda não está disponível");
  }

  async authorize(): Promise<void> {
    // TODO: require PAYMENTS_ALLOCATE permission when implemented
  }

  async execute(): Promise<PaymentAllocation[]> {
    return [];
  }
}
