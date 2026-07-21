import { describe, it, expect, vi, beforeEach } from "vitest";

// H3 — the finance summary is computed with SQL COUNT / SUM / MIN / MAX; it never loads
// the invoice/payment/refund lists into memory.
const invoiceGroupBy = vi.fn();
const invoiceAggregate = vi.fn();
const paymentAggregate = vi.fn();
const refundAggregate = vi.fn();
const refundCount = vi.fn();
const walletTxAggregate = vi.fn();
const creditAggregate = vi.fn();

vi.mock("@/server/db", () => ({
  getDb: async () => ({
    invoice: { groupBy: invoiceGroupBy, aggregate: invoiceAggregate },
    payment: { aggregate: paymentAggregate },
    refund: { aggregate: refundAggregate, count: refundCount },
    studentWalletTransaction: { aggregate: walletTxAggregate },
    creditApplication: { aggregate: creditAggregate },
  }),
}));

import { getStudentFinanceSummary } from "../student-finance-summary.repository";

const ORG = "org-1";
const STUDENT = "student-1";

beforeEach(() => {
  vi.clearAllMocks();
  invoiceGroupBy.mockResolvedValue([
    { status: "OVERDUE", _count: { _all: 2 }, _sum: { totalAmount: 300, balanceAmount: 250 } },
    { status: "PENDING", _count: { _all: 1 }, _sum: { totalAmount: 100, balanceAmount: 100 } },
    { status: "PAID", _count: { _all: 1 }, _sum: { totalAmount: 100, balanceAmount: 0 } },
  ]);
  invoiceAggregate.mockResolvedValue({ _min: { dueDate: new Date("2026-09-01") } });
  paymentAggregate.mockResolvedValue({ _sum: { totalAmount: 200 }, _max: { paymentDate: new Date("2026-06-15") } });
  refundAggregate.mockResolvedValue({ _sum: { amount: 50 } });
  refundCount.mockResolvedValue(1);
  walletTxAggregate.mockResolvedValue({ _sum: { amount: 30 } });
  creditAggregate.mockResolvedValue({ _sum: { amount: 10 } });
});

describe("getStudentFinanceSummary (H3)", () => {
  it("derives billing aggregates from the grouped-by-status pass (SUM + COUNT)", async () => {
    const s = await getStudentFinanceSummary(STUDENT, ORG);
    expect(s.totalInvoiced).toBe(500); // 300 + 100 + 100
    expect(s.outstandingBalance).toBe(350); // 250 + 100 + 0
    expect(s.overdueInvoiceCount).toBe(2);
    expect(s.overdueAmount).toBe(250);
    expect(s.unpaidInvoiceCount).toBe(3); // OVERDUE 2 + PENDING 1
    expect(s.paidInvoiceCount).toBe(1);
  });

  it("takes nextDueDate from MIN(dueDate) and lastPaymentDate from MAX(paymentDate)", async () => {
    const s = await getStudentFinanceSummary(STUDENT, ORG);
    expect(s.nextDueDate).toEqual(new Date("2026-09-01"));
    expect(s.lastPaymentDate).toEqual(new Date("2026-06-15"));
  });

  it("maps payment / refund / wallet / credit aggregates", async () => {
    const s = await getStudentFinanceSummary(STUDENT, ORG);
    expect(s.totalPaid).toBe(200);
    expect(s.totalRefunded).toBe(50);
    expect(s.pendingRefundCount).toBe(1);
    expect(s.walletBalance).toBe(30);
    expect(s.creditApplied).toBe(10);
  });

  it("scopes every aggregate by organization + student", async () => {
    await getStudentFinanceSummary(STUDENT, ORG);
    for (const fn of [invoiceGroupBy, invoiceAggregate, paymentAggregate, refundAggregate, refundCount, creditAggregate]) {
      expect(fn.mock.calls[0][0].where).toMatchObject({ organizationId: ORG, studentId: STUDENT });
    }
    // Wallet transactions are scoped via the wallet relation.
    expect(walletTxAggregate.mock.calls[0][0].where).toMatchObject({ organizationId: ORG, wallet: { studentId: STUDENT } });
  });

  it("never calls findMany (no list is loaded — aggregations only)", async () => {
    // The mocked db exposes only aggregate/groupBy/count; a findMany call would throw.
    await expect(getStudentFinanceSummary(STUDENT, ORG)).resolves.toBeDefined();
  });
});
