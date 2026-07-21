import { describe, it, expect, vi, beforeEach } from "vitest";

// M2 — the lazy, permission-gated, server-paginated finance-tab loader.
const h = vi.hoisted(() => ({
  invoices: vi.fn(),
  payments: vi.fn(),
  receipts: vi.fn(),
  refunds: vi.fn(),
}));

vi.mock("@/modules/reports/finance/services/financial-reports.service", () => ({
  getStudentFinancialStatement: vi.fn(),
  getStudentInvoicesPage: h.invoices,
  getStudentPaymentsPage: h.payments,
  getStudentReceiptsPage: h.receipts,
  getStudentRefundsPage: h.refunds,
}));

import { getFinanceTabData } from "../services/student-360.service";

const ORG = "org-1";
const STUDENT = "student-1";
const BOTH = { canViewInvoices: true, canViewWallet: true };

function pageResult(over: Record<string, unknown> = {}) {
  return { data: [], total: 0, page: 1, pageSize: 20, totalPages: 0, hasNextPage: false, hasPreviousPage: false, ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.invoices.mockResolvedValue(pageResult());
  h.payments.mockResolvedValue(pageResult());
  h.receipts.mockResolvedValue(pageResult());
  h.refunds.mockResolvedValue(pageResult());
});

describe("getFinanceTabData (M2)", () => {
  it("fetches only the ACTIVE section, with a server-bounded page size (never from the client)", async () => {
    const result = await getFinanceTabData(STUDENT, ORG, "invoices", 2, BOTH);
    expect(h.invoices).toHaveBeenCalledWith({ organizationId: ORG, studentId: STUDENT }, { page: 2, pageSize: 20 });
    expect(h.payments).not.toHaveBeenCalled();
    expect(h.receipts).not.toHaveBeenCalled();
    expect(h.refunds).not.toHaveBeenCalled();
    expect(result?.section).toBe("invoices");
  });

  it("gates billing sections on INVOICES_VIEW — no query, returns null when unauthorized", async () => {
    const result = await getFinanceTabData(STUDENT, ORG, "invoices", 1, { canViewInvoices: false, canViewWallet: true });
    expect(result).toBeNull();
    expect(h.invoices).not.toHaveBeenCalled();
  });

  it("gates the refunds section on WALLETS_VIEW", async () => {
    expect(await getFinanceTabData(STUDENT, ORG, "refunds", 1, { canViewInvoices: true, canViewWallet: false })).toBeNull();
    expect(h.refunds).not.toHaveBeenCalled();

    await getFinanceTabData(STUDENT, ORG, "refunds", 1, { canViewInvoices: false, canViewWallet: true });
    expect(h.refunds).toHaveBeenCalledOnce();
  });

  it("normalizes page < 1 to 1", async () => {
    await getFinanceTabData(STUDENT, ORG, "invoices", 0, BOTH);
    expect(h.invoices).toHaveBeenCalledWith(expect.anything(), { page: 1, pageSize: 20 });
  });

  it("normalizes an out-of-range page to the last page (avoids a misleading empty state)", async () => {
    h.invoices
      .mockResolvedValueOnce(pageResult({ total: 50, totalPages: 3, page: 9, data: [] }))
      .mockResolvedValueOnce(pageResult({ total: 50, totalPages: 3, page: 3, data: [{ invoiceId: "i" }] }));
    const result = await getFinanceTabData(STUDENT, ORG, "invoices", 9, BOTH);
    expect(h.invoices).toHaveBeenCalledTimes(2);
    expect(h.invoices).toHaveBeenLastCalledWith(expect.anything(), { page: 3, pageSize: 20 });
    expect(result?.page.page).toBe(3);
  });

  it("does NOT re-query when the page is in range", async () => {
    h.payments.mockResolvedValueOnce(pageResult({ total: 10, totalPages: 1, page: 1, data: [{ paymentId: "p" }] }));
    await getFinanceTabData(STUDENT, ORG, "payments", 1, BOTH);
    expect(h.payments).toHaveBeenCalledOnce();
  });
});
