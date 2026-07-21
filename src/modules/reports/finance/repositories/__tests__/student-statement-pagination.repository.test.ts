import { describe, it, expect, vi, beforeEach } from "vitest";

// M2 — server-side pagination happens in the repository ($transaction of findMany + count),
// scoped by org + student, stable order ([date desc, id desc]), soft-delete excluded.
const invoiceFindMany = vi.fn();
const invoiceCount = vi.fn();
const refundFindMany = vi.fn();
const refundCount = vi.fn();

vi.mock("@/server/db", () => ({
  getDb: async () => ({
    invoice: { findMany: invoiceFindMany, count: invoiceCount },
    refund: { findMany: refundFindMany, count: refundCount },
    // The repository composes [findMany(...), count(...)] and awaits them together.
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
  }),
}));

import {
  getStudentInvoicesPage,
  getStudentRefundsPage,
} from "../student-statement.repository";

const FILTERS = { organizationId: "org-1", studentId: "student-1" };

beforeEach(() => vi.clearAllMocks());

describe("getStudentInvoicesPage", () => {
  it("scopes by org + student + soft-delete, orders stably, and applies skip/take", async () => {
    invoiceFindMany.mockResolvedValue([]);
    invoiceCount.mockResolvedValue(0);

    await getStudentInvoicesPage(FILTERS, { page: 3, pageSize: 20 });

    const args = invoiceFindMany.mock.calls[0][0];
    expect(args.where).toEqual({ organizationId: "org-1", studentId: "student-1", deletedAt: null });
    expect(args.orderBy).toEqual([{ issueDate: "desc" }, { id: "desc" }]);
    expect(args.skip).toBe(40); // (3 - 1) * 20
    expect(args.take).toBe(20);
    // count uses the SAME scoping where clause.
    expect(invoiceCount.mock.calls[0][0].where).toEqual(args.where);
  });

  it("returns a PaginatedResult with the total and derived page flags", async () => {
    invoiceFindMany.mockResolvedValue([
      { id: "i1", invoiceNumber: "F1", issueDate: new Date("2026-06-01"), dueDate: null, totalAmount: 100, paidAmount: 0, balanceAmount: 100, status: "PENDING" },
    ]);
    invoiceCount.mockResolvedValue(45);

    const result = await getStudentInvoicesPage(FILTERS, { page: 2, pageSize: 20 });

    expect(result.total).toBe(45);
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(20);
    expect(result.totalPages).toBe(3); // ceil(45 / 20)
    expect(result.hasPreviousPage).toBe(true);
    expect(result.hasNextPage).toBe(true);
    expect(result.data[0].invoiceId).toBe("i1");
    expect(result.data[0].balanceAmount).toBe(100);
  });
});

describe("getStudentRefundsPage", () => {
  it("scopes by org + student + soft-delete, ordered by createdAt then id", async () => {
    refundFindMany.mockResolvedValue([]);
    refundCount.mockResolvedValue(0);

    await getStudentRefundsPage(FILTERS, { page: 1, pageSize: 20 });

    const args = refundFindMany.mock.calls[0][0];
    expect(args.where).toEqual({ organizationId: "org-1", studentId: "student-1", deletedAt: null });
    expect(args.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(args.skip).toBe(0);
    expect(args.take).toBe(20);
  });
});
