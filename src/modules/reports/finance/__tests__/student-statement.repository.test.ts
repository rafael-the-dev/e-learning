import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInvoiceFindMany = vi.fn();
const mockPaymentFindMany = vi.fn();
const mockRefundFindMany = vi.fn();
const mockWalletTxAggregate = vi.fn();
const mockCreditAggregate = vi.fn();
const mockStudentFindFirst = vi.fn();

vi.mock("@/server/db", () => ({
  getDb: async () => ({
    invoice: { findMany: mockInvoiceFindMany },
    payment: { findMany: mockPaymentFindMany },
    refund: { findMany: mockRefundFindMany },
    studentWalletTransaction: { aggregate: mockWalletTxAggregate },
    creditApplication: { aggregate: mockCreditAggregate },
    student: { findFirst: mockStudentFindFirst },
  }),
}));

import { getStudentStatementKPIs, getStudentInfo } from "../repositories/student-statement.repository";

const ORG = "org-1";
const STUDENT = "student-1";

beforeEach(() => vi.clearAllMocks());

describe("getStudentStatementKPIs", () => {
  it("aggregates wallet transactions by the `wallet` relation, not `studentWallet`", async () => {
    mockInvoiceFindMany.mockResolvedValue([]);
    mockPaymentFindMany.mockResolvedValue([]);
    mockRefundFindMany.mockResolvedValue([]);
    mockWalletTxAggregate.mockResolvedValue({ _sum: { amount: 5500 } });
    mockCreditAggregate.mockResolvedValue({ _sum: { amount: 0 } });

    const result = await getStudentStatementKPIs({ organizationId: ORG, studentId: STUDENT });

    // Regression guard: this Prisma relation field is `wallet`, not `studentWallet` —
    // using the wrong name throws PrismaClientValidationError at runtime, not at
    // typecheck time, so this assertion is the only thing catching it.
    const where = mockWalletTxAggregate.mock.calls[0][0].where;
    expect(where).toEqual({ organizationId: ORG, wallet: { studentId: STUDENT } });
    expect(where.studentWallet).toBeUndefined();
    expect(result.walletBalance).toBe(5500);
  });

  it("computes outstanding balance and totals from non-cancelled invoices and confirmed payments", async () => {
    mockInvoiceFindMany.mockResolvedValue([
      { totalAmount: 1000, balanceAmount: 0 },
      { totalAmount: 500, balanceAmount: 500 },
    ]);
    mockPaymentFindMany.mockResolvedValue([{ totalAmount: 1000 }]);
    mockRefundFindMany.mockResolvedValue([{ amount: 100 }]);
    mockWalletTxAggregate.mockResolvedValue({ _sum: { amount: null } });
    mockCreditAggregate.mockResolvedValue({ _sum: { amount: null } });

    const result = await getStudentStatementKPIs({ organizationId: ORG, studentId: STUDENT });

    expect(result.totalInvoiced).toBe(1500);
    expect(result.outstandingBalance).toBe(500);
    expect(result.totalPaid).toBe(1000);
    expect(result.totalRefunded).toBe(100);
    expect(result.walletBalance).toBe(0);
  });

  it("scopes every query by organizationId and studentId", async () => {
    mockInvoiceFindMany.mockResolvedValue([]);
    mockPaymentFindMany.mockResolvedValue([]);
    mockRefundFindMany.mockResolvedValue([]);
    mockWalletTxAggregate.mockResolvedValue({ _sum: { amount: null } });
    mockCreditAggregate.mockResolvedValue({ _sum: { amount: null } });

    await getStudentStatementKPIs({ organizationId: ORG, studentId: STUDENT });

    expect(mockInvoiceFindMany.mock.calls[0][0].where).toMatchObject({ organizationId: ORG, studentId: STUDENT });
    expect(mockPaymentFindMany.mock.calls[0][0].where).toMatchObject({ organizationId: ORG, studentId: STUDENT });
    expect(mockRefundFindMany.mock.calls[0][0].where).toMatchObject({ organizationId: ORG, studentId: STUDENT });
    expect(mockCreditAggregate.mock.calls[0][0].where).toMatchObject({ organizationId: ORG, studentId: STUDENT });
  });
});

describe("getStudentInfo", () => {
  it("returns null for a student outside the given organization", async () => {
    mockStudentFindFirst.mockResolvedValue(null);
    const result = await getStudentInfo(STUDENT, ORG);
    expect(result).toBeNull();
    expect(mockStudentFindFirst.mock.calls[0][0].where).toMatchObject({ id: STUDENT, organizationId: ORG });
  });
});
