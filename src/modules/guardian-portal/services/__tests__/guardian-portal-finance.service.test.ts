import { describe, it, expect } from "vitest";
import { buildGuardianFinanceSection } from "../guardian-portal-finance.service";
import type {
  Student360BillingSummary,
  Student360WalletSummary,
} from "@/modules/students/student-360/services/student-360.service";

function billing(
  invoices: Array<{ status: string; balanceAmount: number; dueDate: Date | null }>,
  outstandingBalance = 150,
): Student360BillingSummary {
  return {
    invoices: invoices.map((inv, i) => ({
      invoiceId: `inv-${i}`,
      invoiceNumber: `F-${i}`,
      issueDate: new Date("2026-01-01"),
      dueDate: inv.dueDate,
      totalAmount: 100,
      paidAmount: 100 - inv.balanceAmount,
      balanceAmount: inv.balanceAmount,
      status: inv.status,
    })),
    payments: [
      { paymentId: "p1", paymentNumber: "R-1", paymentDate: new Date("2026-02-01"), totalAmount: 50, status: "CONFIRMED" },
    ],
    receipts: [],
    totalInvoiced: 200,
    totalPaid: 50,
    outstandingBalance,
  } as unknown as Student360BillingSummary;
}

function wallet(walletBalance = 20): Student360WalletSummary {
  return {
    wallet: null,
    recentTransactions: [],
    walletBalance,
    creditApplied: 0,
    totalRefunded: 0,
    refunds: [],
  } as unknown as Student360WalletSummary;
}

describe("buildGuardianFinanceSection", () => {
  it("returns only unpaid/overdue/partial invoices and counts them", () => {
    const b = billing([
      { status: "PAID", balanceAmount: 0, dueDate: new Date("2026-03-01") },
      { status: "PENDING", balanceAmount: 100, dueDate: new Date("2026-04-01") },
      { status: "OVERDUE", balanceAmount: 50, dueDate: new Date("2026-02-01") },
    ]);
    const section = buildGuardianFinanceSection(b, wallet(), 10, 10);
    expect(section.invoices).toHaveLength(2); // PAID excluded
    expect(section.pendingInvoiceCount).toBe(2);
  });

  it("sums overdue balances and picks the earliest due date; billing→totalDue, wallet→walletBalance", () => {
    const b = billing(
      [
        { status: "OVERDUE", balanceAmount: 50, dueDate: new Date("2026-02-15") },
        { status: "PENDING", balanceAmount: 100, dueDate: new Date("2026-01-10") },
      ],
      150,
    );
    const section = buildGuardianFinanceSection(b, wallet(20), 10, 10);
    expect(section.summary.overdueAmount).toBe(50);
    expect(section.summary.nextDueDate?.toISOString().slice(0, 10)).toBe("2026-01-10");
    expect(section.summary.totalDue).toBe(150); // from billing
    expect(section.summary.walletBalance).toBe(20); // from wallet
  });

  it("is empty/zero when neither billing nor wallet is present (no finance data)", () => {
    const section = buildGuardianFinanceSection(null, null, 10, 10);
    expect(section.invoices).toEqual([]);
    expect(section.payments).toEqual([]);
    expect(section.pendingInvoiceCount).toBe(0);
    expect(section.summary.totalDue).toBe(0);
    expect(section.summary.walletBalance).toBe(0);
  });
});
