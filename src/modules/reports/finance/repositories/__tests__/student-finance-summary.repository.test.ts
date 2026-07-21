import { describe, it, expect, vi, beforeEach } from "vitest";

// H3 + F-M1 — the finance summary is computed with SQL COUNT / SUM / MIN / MAX (never
// loads lists). Overdue uses the CANONICAL fact (open + balance > 0 + dueDate < boundary)
// via a dedicated aggregate, NOT the materialized OVERDUE status.
const invoiceGroupBy = vi.fn();
const invoiceAggregate = vi.fn();
const paymentAggregate = vi.fn();
const refundAggregate = vi.fn();
const refundCount = vi.fn();
const walletTxAggregate = vi.fn();
const creditAggregate = vi.fn();
const orgFindUnique = vi.fn();

vi.mock("@/server/db", () => ({
  getDb: async () => ({
    organization: { findUnique: orgFindUnique },
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
const AS_OF = new Date("2026-07-21T09:00:00Z"); // fixes the boundary to 2026-07-21T00:00Z (UTC, grace 0)

beforeEach(() => {
  vi.clearAllMocks();
  orgFindUnique.mockResolvedValue({ timezone: "UTC", settings: { overdueGraceDays: 0 } });
  invoiceGroupBy.mockResolvedValue([
    { status: "OVERDUE", _count: { _all: 2 }, _sum: { totalAmount: 300, balanceAmount: 250 } },
    { status: "PENDING", _count: { _all: 1 }, _sum: { totalAmount: 100, balanceAmount: 100 } },
    { status: "PAID", _count: { _all: 1 }, _sum: { totalAmount: 100, balanceAmount: 0 } },
  ]);
  // invoice.aggregate is called twice, in order: (1) canonical overdue, (2) nextDue.
  invoiceAggregate
    .mockResolvedValueOnce({ _sum: { balanceAmount: 6000 }, _min: { dueDate: new Date("2026-05-10") }, _count: { _all: 1 } })
    .mockResolvedValueOnce({ _min: { dueDate: new Date("2026-09-01") } });
  paymentAggregate.mockResolvedValue({ _sum: { totalAmount: 200 }, _max: { paymentDate: new Date("2026-06-15") } });
  refundAggregate.mockResolvedValue({ _sum: { amount: 50 } });
  refundCount.mockResolvedValue(1);
  walletTxAggregate.mockResolvedValue({ _sum: { amount: 30 } });
  creditAggregate.mockResolvedValue({ _sum: { amount: 10 } });
});

describe("getStudentFinanceSummary — billing aggregates", () => {
  it("derives totals/counts from the grouped-by-status pass", async () => {
    const s = await getStudentFinanceSummary(STUDENT, ORG, AS_OF);
    expect(s.totalInvoiced).toBe(500); // 300 + 100 + 100
    expect(s.outstandingBalance).toBe(350); // 250 + 100 + 0
    expect(s.unpaidInvoiceCount).toBe(3); // OVERDUE 2 + PENDING 1
    expect(s.paidInvoiceCount).toBe(1);
  });

  it("takes nextDueDate/lastPaymentDate and the payment/refund/wallet/credit aggregates", async () => {
    const s = await getStudentFinanceSummary(STUDENT, ORG, AS_OF);
    expect(s.nextDueDate).toEqual(new Date("2026-09-01"));
    expect(s.lastPaymentDate).toEqual(new Date("2026-06-15"));
    expect(s.totalPaid).toBe(200);
    expect(s.totalRefunded).toBe(50);
    expect(s.pendingRefundCount).toBe(1);
    expect(s.walletBalance).toBe(30);
    expect(s.creditApplied).toBe(10);
  });
});

describe("getStudentFinanceSummary — F-M1 canonical overdue", () => {
  it("takes overdue from the dedicated fact aggregate, not the OVERDUE status count", async () => {
    const s = await getStudentFinanceSummary(STUDENT, ORG, AS_OF);
    // NOT the grouped OVERDUE row (count 2 / 250) — the fact aggregate (count 1 / 6000).
    expect(s.overdueInvoiceCount).toBe(1);
    expect(s.overdueAmount).toBe(6000);
    expect(s.oldestOverdueDate).toEqual(new Date("2026-05-10"));
    expect(s.asOf).toBe(AS_OF);
  });

  it("scopes the overdue aggregate to open-status + positive balance + dueDate < boundary", async () => {
    await getStudentFinanceSummary(STUDENT, ORG, AS_OF);
    const overdueWhere = invoiceAggregate.mock.calls[0][0].where;
    expect(overdueWhere).toMatchObject({
      organizationId: ORG,
      studentId: STUDENT,
      deletedAt: null,
      status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] },
      balanceAmount: { gt: 0 },
    });
    // Boundary = start of 2026-07-21 UTC (grace 0). Due-today is NOT overdue; earlier is.
    expect(overdueWhere.dueDate).toEqual({ lt: new Date("2026-07-21T00:00:00.000Z") });
  });

  it("applies the org's grace days to the boundary (same window the billing job uses)", async () => {
    orgFindUnique.mockResolvedValue({ timezone: "UTC", settings: { overdueGraceDays: 5 } });
    await getStudentFinanceSummary(STUDENT, ORG, AS_OF);
    const overdueWhere = invoiceAggregate.mock.calls[0][0].where;
    expect(overdueWhere.dueDate).toEqual({ lt: new Date("2026-07-16T00:00:00.000Z") }); // 5 days earlier
  });

  it("reports zero overdue (not NaN) when the fact aggregate finds nothing", async () => {
    invoiceAggregate.mockReset();
    invoiceAggregate
      .mockResolvedValueOnce({ _sum: { balanceAmount: null }, _min: { dueDate: null }, _count: { _all: 0 } })
      .mockResolvedValueOnce({ _min: { dueDate: null } });
    const s = await getStudentFinanceSummary(STUDENT, ORG, AS_OF);
    expect(s.overdueInvoiceCount).toBe(0);
    expect(s.overdueAmount).toBe(0);
    expect(s.oldestOverdueDate).toBeNull();
  });
});

describe("getStudentFinanceSummary — scoping", () => {
  it("scopes every aggregate by organization + student", async () => {
    await getStudentFinanceSummary(STUDENT, ORG, AS_OF);
    for (const fn of [invoiceGroupBy, paymentAggregate, refundAggregate, refundCount, creditAggregate]) {
      expect(fn.mock.calls[0][0].where).toMatchObject({ organizationId: ORG, studentId: STUDENT });
    }
    expect(walletTxAggregate.mock.calls[0][0].where).toMatchObject({ organizationId: ORG, wallet: { studentId: STUDENT } });
    // The org (timezone + grace) is read for THIS org only.
    expect(orgFindUnique.mock.calls[0][0].where).toEqual({ id: ORG });
  });
});
