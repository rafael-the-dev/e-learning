import { describe, it, expect } from "vitest";
import { buildGuardianFinanceSection } from "../guardian-portal-finance.service";
import type {
  Student360BillingSummary,
  Student360WalletSummary,
} from "@/modules/students/student-360/services/student-360.service";
import type { StudentStatementInvoice, StudentStatementPayment } from "@/modules/reports/finance/types";

// H3 — the guardian finance section takes AGGREGATED summaries (the summary figures come
// from SQL, not from a loaded list) + a pre-fetched BOUNDED page of rows.
function billing(over: Partial<Student360BillingSummary> = {}): Student360BillingSummary {
  return {
    totalInvoiced: 200,
    totalPaid: 50,
    outstandingBalance: 150,
    overdueAmount: 50,
    overdueInvoiceCount: 1,
    unpaidInvoiceCount: 2,
    nextDueDate: new Date("2026-01-10"),
    lastPaymentDate: new Date("2026-02-01"),
    ...over,
  };
}

function wallet(over: Partial<Student360WalletSummary> = {}): Student360WalletSummary {
  return {
    walletBalance: 20,
    creditApplied: 0,
    totalRefunded: 0,
    pendingRefundCount: 0,
    wallet: null,
    recentTransactions: [],
    ...over,
  };
}

const invoiceRows: StudentStatementInvoice[] = [
  { invoiceId: "i1", invoiceNumber: "F-1", issueDate: new Date("2026-01-01"), dueDate: new Date("2026-02-01"), totalAmount: 100, paidAmount: 0, balanceAmount: 100, status: "PENDING" },
];
const paymentRows: StudentStatementPayment[] = [
  { paymentId: "p1", paymentNumber: "R-1", paymentDate: new Date("2026-02-01"), totalAmount: 50, status: "CONFIRMED", paymentMethods: ["CASH"], invoiceNumber: "F-1", receiptNumber: null },
];

describe("buildGuardianFinanceSection", () => {
  it("maps the pre-fetched bounded rows to the guardian row shapes", () => {
    const section = buildGuardianFinanceSection(billing(), wallet(), invoiceRows, paymentRows);
    expect(section.invoices).toHaveLength(1);
    expect(section.invoices[0]).toMatchObject({ invoiceId: "i1", invoiceNumber: "F-1", balanceAmount: 100, status: "PENDING" });
    expect(section.payments).toHaveLength(1);
    expect(section.payments[0]).toMatchObject({ paymentId: "p1", paymentNumber: "R-1", totalAmount: 50 });
  });

  it("takes the summary figures from the aggregated billing/wallet summary, not the rows", () => {
    const section = buildGuardianFinanceSection(billing(), wallet(), invoiceRows, paymentRows);
    expect(section.summary.totalDue).toBe(150); // billing.outstandingBalance
    expect(section.summary.overdueAmount).toBe(50); // billing.overdueAmount (SQL, not row-summed)
    expect(section.summary.nextDueDate?.toISOString().slice(0, 10)).toBe("2026-01-10"); // billing.nextDueDate
    expect(section.summary.walletBalance).toBe(20); // wallet.walletBalance
    expect(section.pendingInvoiceCount).toBe(2); // billing.unpaidInvoiceCount
  });

  it("is empty/zero when neither summary is present and no rows were fetched", () => {
    const section = buildGuardianFinanceSection(null, null, [], []);
    expect(section.invoices).toEqual([]);
    expect(section.payments).toEqual([]);
    expect(section.pendingInvoiceCount).toBe(0);
    expect(section.summary.totalDue).toBe(0);
    expect(section.summary.walletBalance).toBe(0);
  });
});
