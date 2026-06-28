import { describe, it, expect } from "vitest";
import { buildGuardianFinanceSection } from "../guardian-portal-finance.service";
import type { StudentFinancialStatement } from "@/modules/reports/finance/types";

function statement(
  invoices: Array<{ status: string; balanceAmount: number; dueDate: Date | null }>,
): StudentFinancialStatement {
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
    kpis: { outstandingBalance: 150, walletBalance: 20 },
  } as unknown as StudentFinancialStatement;
}

describe("buildGuardianFinanceSection", () => {
  it("returns only unpaid/overdue/partial invoices and counts them", () => {
    const s = statement([
      { status: "PAID", balanceAmount: 0, dueDate: new Date("2026-03-01") },
      { status: "PENDING", balanceAmount: 100, dueDate: new Date("2026-04-01") },
      { status: "OVERDUE", balanceAmount: 50, dueDate: new Date("2026-02-01") },
    ]);
    const section = buildGuardianFinanceSection(s, 10, 10);
    expect(section.invoices).toHaveLength(2); // PAID excluded
    expect(section.pendingInvoiceCount).toBe(2);
  });

  it("sums overdue balances and picks the earliest due date", () => {
    const s = statement([
      { status: "OVERDUE", balanceAmount: 50, dueDate: new Date("2026-02-15") },
      { status: "PENDING", balanceAmount: 100, dueDate: new Date("2026-01-10") },
    ]);
    const section = buildGuardianFinanceSection(s, 10, 10);
    expect(section.summary.overdueAmount).toBe(50);
    expect(section.summary.nextDueDate?.toISOString().slice(0, 10)).toBe("2026-01-10");
    expect(section.summary.totalDue).toBe(150);
    expect(section.summary.walletBalance).toBe(20);
  });

  it("is empty/zero for a null statement (no finance data)", () => {
    const section = buildGuardianFinanceSection(null, 10, 10);
    expect(section.invoices).toEqual([]);
    expect(section.payments).toEqual([]);
    expect(section.pendingInvoiceCount).toBe(0);
    expect(section.summary.totalDue).toBe(0);
  });
});
