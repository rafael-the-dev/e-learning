import type { ServiceContext } from "@/shared/types/common";
import { appendFinancialAuditLog } from "../repositories/financial-audit.repository";
import type { FinancialAuditLogInput } from "../types";

// =============================================================================
// FINANCIAL AUDIT SERVICE
//
// Append-only: every call creates a new row and returns its ID.
// Failures are intentionally non-fatal: a logging failure must never abort
// the financial mutation that triggered it. Callers should await this but
// must not let it throw.
//
// Usage:
//   await financialAuditService.log(context, {
//     eventType: FinancialAuditEventType.PAYMENT_CONFIRMED,
//     entityType: "Payment",
//     entityId: payment.id,
//     amount: payment.totalAmount,
//     beforeData: { status: "PENDING" },
//     afterData:  { status: "CONFIRMED" },
//     metadata:   { invoiceId: payment.invoiceId },
//   });
// =============================================================================

export class FinancialAuditService {
  async log(
    context: Pick<ServiceContext, "organizationId" | "userId" | "ipAddress" | "userAgent">,
    input: FinancialAuditLogInput
  ): Promise<string | null> {
    try {
      return await appendFinancialAuditLog(
        context.organizationId,
        context.userId ?? null,
        context.ipAddress ?? null,
        context.userAgent ?? null,
        input
      );
    } catch (err) {
      // Audit failures are logged to stderr but never propagated.
      // The financial transaction has already committed at this point.
      console.error("[FinancialAuditService] Failed to write audit log:", err);
      return null;
    }
  }
}

export const financialAuditService = new FinancialAuditService();
