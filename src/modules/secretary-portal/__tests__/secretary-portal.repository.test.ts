import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Prisma client mock ───────────────────────────────────────────────────────
const m = {
  enrollment: { count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
  student: { count: vi.fn(), findMany: vi.fn() },
  payment: { count: vi.fn(), aggregate: vi.fn() },
  invoice: { count: vi.fn(), aggregate: vi.fn(), findMany: vi.fn() },
  studentDocument: { count: vi.fn(), findMany: vi.fn() },
  classGroup: { count: vi.fn(), findMany: vi.fn() },
  refund: { aggregate: vi.fn() },
  assessment: { findMany: vi.fn() },
  academicEvent: { findMany: vi.fn() },
  $queryRaw: vi.fn(),
};

vi.mock("@/server/db", () => ({ getDb: async () => m }));

import {
  countPendingEnrollments,
  countActiveStudents,
  countPendingPayments,
  countOverdueInvoices,
  countDocumentsPendingReview,
  aggregateOverdueInvoices,
  aggregatePendingPayments,
  aggregatePendingRefunds,
  countActiveStudentsWithoutPortalAccount,
  countInactiveStudentsWithActiveEnrollment,
  findPendingEnrollments,
  findAttentionInvoices,
  findDocumentsPendingReview,
  findRecentStudents,
  findActiveStudentsWithoutPortalAccount,
} from "../repositories/secretary-portal.repository";

const ORG = "org-1";
const NOW = new Date("2026-06-28T12:00:00");

beforeEach(() => vi.clearAllMocks());

describe("KPI counts — SQL aggregation, tenant-scoped", () => {
  it("(6) pending enrollments: counts only DRAFT/PENDING_PAYMENT, org-scoped", async () => {
    m.enrollment.count.mockResolvedValue(4);
    const result = await countPendingEnrollments(ORG);
    expect(result).toBe(4);
    const where = m.enrollment.count.mock.calls[0][0].where;
    expect(where.organizationId).toBe(ORG);
    expect(where.deletedAt).toBeNull();
    expect(where.status).toEqual({ in: ["DRAFT", "PENDING_PAYMENT"] });
  });

  it("(7) active students: counts status ACTIVE, org-scoped", async () => {
    m.student.count.mockResolvedValue(120);
    expect(await countActiveStudents(ORG)).toBe(120);
    expect(m.student.count.mock.calls[0][0].where).toMatchObject({ organizationId: ORG, status: "ACTIVE" });
  });

  it("(8) pending payments: counts status PENDING, org-scoped", async () => {
    m.payment.count.mockResolvedValue(3);
    expect(await countPendingPayments(ORG)).toBe(3);
    expect(m.payment.count.mock.calls[0][0].where).toMatchObject({ organizationId: ORG, status: "PENDING" });
  });

  it("(9) overdue invoices: open + balance>0 + dueDate before now, org-scoped", async () => {
    m.invoice.count.mockResolvedValue(5);
    expect(await countOverdueInvoices(ORG, NOW)).toBe(5);
    const where = m.invoice.count.mock.calls[0][0].where;
    expect(where.organizationId).toBe(ORG);
    expect(where.status).toEqual({ notIn: ["CANCELLED", "PAID"] });
    expect(where.balanceAmount).toEqual({ gt: 0 });
    expect(where.dueDate).toEqual({ lt: NOW });
  });

  it("(15) documents: counts ONLY PENDING uploads — no fabricated missing-required-doc logic", async () => {
    m.studentDocument.count.mockResolvedValue(2);
    expect(await countDocumentsPendingReview(ORG)).toBe(2);
    const where = m.studentDocument.count.mock.calls[0][0].where;
    expect(where).toMatchObject({ organizationId: ORG, status: "PENDING" });
    // No join/filter against any "required documents" config — that data does not exist.
    expect(JSON.stringify(where)).not.toMatch(/required/i);
  });
});

describe("Financial aggregates — use _sum/_count, not row loading", () => {
  it("(22) overdue invoices aggregate sums balanceAmount", async () => {
    m.invoice.aggregate.mockResolvedValue({ _count: { _all: 5 }, _sum: { balanceAmount: { toNumber: () => 250 } } });
    const result = await aggregateOverdueInvoices(ORG, NOW);
    expect(result).toEqual({ count: 5, amount: 250 });
    const arg = m.invoice.aggregate.mock.calls[0][0];
    expect(arg._sum).toEqual({ balanceAmount: true });
    expect(arg.where.organizationId).toBe(ORG);
  });

  it("(22) pending payments aggregate sums totalAmount", async () => {
    m.payment.aggregate.mockResolvedValue({ _count: { _all: 3 }, _sum: { totalAmount: { toNumber: () => 90 } } });
    expect(await aggregatePendingPayments(ORG)).toEqual({ count: 3, amount: 90 });
  });

  it("(22) pending refunds aggregate sums amount for REQUESTED/APPROVED", async () => {
    m.refund.aggregate.mockResolvedValue({ _count: { _all: 1 }, _sum: { amount: { toNumber: () => 40 } } });
    expect(await aggregatePendingRefunds(ORG)).toEqual({ count: 1, amount: 40 });
    expect(m.refund.aggregate.mock.calls[0][0].where.status).toEqual({ in: ["REQUESTED", "APPROVED"] });
  });

  it("treats a null _sum (no rows) as amount 0", async () => {
    m.invoice.aggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: { balanceAmount: null } });
    expect(await aggregateOverdueInvoices(ORG, NOW)).toEqual({ count: 0, amount: 0 });
  });
});

describe("Operational queues — bounded (top-N), tenant-scoped", () => {
  it("(12) pending enrollments: passes take=limit and scopes by org + status", async () => {
    m.enrollment.findMany.mockResolvedValue([]);
    await findPendingEnrollments(ORG, 10);
    const arg = m.enrollment.findMany.mock.calls[0][0];
    expect(arg.take).toBe(10);
    expect(arg.where).toMatchObject({ organizationId: ORG, status: { in: ["DRAFT", "PENDING_PAYMENT"] } });
  });

  it("(13) overdue invoices: passes take=limit and the overdue where clause", async () => {
    m.invoice.findMany.mockResolvedValue([]);
    await findAttentionInvoices(ORG, NOW, 10);
    const arg = m.invoice.findMany.mock.calls[0][0];
    expect(arg.take).toBe(10);
    expect(arg.where.dueDate).toEqual({ lt: NOW });
  });

  it("(14) recent students: passes take=limit, org-scoped, newest first", async () => {
    m.student.findMany.mockResolvedValue([]);
    await findRecentStudents(ORG, 10);
    const arg = m.student.findMany.mock.calls[0][0];
    expect(arg.take).toBe(10);
    expect(arg.where.organizationId).toBe(ORG);
    expect(arg.orderBy).toEqual({ createdAt: "desc" });
  });

  it("(21) documents queue is bounded by take and computes days pending", async () => {
    const created = new Date(NOW.getTime() - 3 * 86_400_000);
    m.studentDocument.findMany.mockResolvedValue([
      { id: "d1", documentType: "CONTRACT", createdAt: created, studentId: "s1", student: { firstName: "Ana", lastName: "Sá" } },
    ]);
    const rows = await findDocumentsPendingReview(ORG, NOW, 10);
    expect(m.studentDocument.findMany.mock.calls[0][0].take).toBe(10);
    expect(rows[0]).toMatchObject({ studentName: "Ana Sá", documentType: "CONTRACT", daysPending: 3 });
  });

  it("(20) students without portal account: filters userId null, bounded", async () => {
    m.student.findMany.mockResolvedValue([]);
    await findActiveStudentsWithoutPortalAccount(ORG, 8);
    const arg = m.student.findMany.mock.calls[0][0];
    expect(arg.take).toBe(8);
    expect(arg.where).toMatchObject({ organizationId: ORG, status: "ACTIVE", userId: null });
  });
});

describe("countInactiveStudentsWithActiveEnrollment — COUNT(DISTINCT), no row transfer (M1)", () => {
  it("uses a single SQL aggregate and coerces the scalar to a number", async () => {
    m.$queryRaw.mockResolvedValue([{ n: 7 }]);
    expect(await countInactiveStudentsWithActiveEnrollment(ORG)).toBe(7);
    // No findMany/groupBy used to count — exactly one $queryRaw call.
    expect(m.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("coerces a bigint scalar and treats no rows as 0", async () => {
    m.$queryRaw.mockResolvedValue([{ n: BigInt(3) }]);
    expect(await countInactiveStudentsWithActiveEnrollment(ORG)).toBe(3);
    m.$queryRaw.mockResolvedValue([]);
    expect(await countInactiveStudentsWithActiveEnrollment(ORG)).toBe(0);
  });
});

describe("Tenant isolation (16)", () => {
  it("every read includes organizationId in its where clause", async () => {
    m.enrollment.count.mockResolvedValue(0);
    m.invoice.aggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: { balanceAmount: null } });
    m.student.count.mockResolvedValue(0);

    await countPendingEnrollments(ORG);
    await aggregateOverdueInvoices(ORG, NOW);
    await countActiveStudentsWithoutPortalAccount(ORG);

    expect(m.enrollment.count.mock.calls[0][0].where.organizationId).toBe(ORG);
    expect(m.invoice.aggregate.mock.calls[0][0].where.organizationId).toBe(ORG);
    expect(m.student.count.mock.calls[0][0].where.organizationId).toBe(ORG);
  });
});
