import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { escapeCsvValue, buildCsvRow } from "../utils/csv-export";

// =============================================================================
// CSV escaping (unit)
// =============================================================================

describe("escapeCsvValue", () => {
  it("passes plain strings through unchanged", () => {
    expect(escapeCsvValue("hello")).toBe("hello");
    expect(escapeCsvValue("Maria Costa")).toBe("Maria Costa");
  });

  it("wraps strings containing commas in double quotes", () => {
    expect(escapeCsvValue("Lisboa, Portugal")).toBe('"Lisboa, Portugal"');
  });

  it("doubles internal quotes and wraps the whole value", () => {
    expect(escapeCsvValue('João "Técnico"')).toBe('"João ""Técnico"""');
  });

  it("wraps strings containing newlines", () => {
    expect(escapeCsvValue("line1\nline2")).toBe('"line1\nline2"');
  });

  it("returns empty string for null", () => {
    expect(escapeCsvValue(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(escapeCsvValue(undefined)).toBe("");
  });

  it("converts numbers to string without quoting", () => {
    expect(escapeCsvValue(42)).toBe("42");
    expect(escapeCsvValue(0)).toBe("0");
  });

  it("handles values containing both comma and quote", () => {
    const val = escapeCsvValue('a,"b"');
    expect(val).toBe('"a,""b"""');
  });
});

describe("buildCsvRow", () => {
  it("joins simple values with commas", () => {
    expect(buildCsvRow(["a", "b", "c"])).toBe("a,b,c");
  });

  it("quotes values that need it and leaves others plain", () => {
    expect(buildCsvRow(["name", "Porto, Norte", 100])).toBe('name,"Porto, Norte",100');
  });

  it("produces empty string for an empty row", () => {
    expect(buildCsvRow([])).toBe("");
  });

  it("handles null and undefined as empty fields", () => {
    expect(buildCsvRow([null, "value", undefined])).toBe(",value,");
  });
});

// =============================================================================
// Route streaming behaviour
// =============================================================================

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockRequirePermission = vi.fn();
const mockAuditLog = vi.fn();
const mockListAccountsReceivable = vi.fn();
const mockListStudentDebtRows = vi.fn();
const mockListIntegrityIssues = vi.fn();
const mockGetBranchRevenue = vi.fn();

vi.mock("@/server/auth/context", () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

vi.mock("@/modules/audit-logs/services/audit.service", () => ({
  auditService: { log: (...args: unknown[]) => mockAuditLog(...args) },
}));

vi.mock("@/modules/reports/finance/repositories/accounts-receivable.repository", () => ({
  listAccountsReceivable: (...args: unknown[]) => mockListAccountsReceivable(...args),
}));

vi.mock("@/modules/reports/finance/repositories/student-debt.repository", () => ({
  listStudentDebtRows: (...args: unknown[]) => mockListStudentDebtRows(...args),
}));

vi.mock("@/modules/reports/finance/repositories/integrity-report.repository", () => ({
  listIntegrityIssuesForReport: (...args: unknown[]) => mockListIntegrityIssues(...args),
}));

vi.mock("@/modules/reports/finance/repositories/branch-revenue.repository", () => ({
  getBranchRevenueReport: (...args: unknown[]) => mockGetBranchRevenue(...args),
}));

// Stub repos not under test
vi.mock("@/modules/reports/finance/repositories/aging.repository", () => ({
  listAgingRows: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
}));
vi.mock("@/modules/reports/finance/repositories/payments-report.repository", () => ({
  listPaymentsReport: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
}));
vi.mock("@/modules/reports/finance/repositories/refunds-report.repository", () => ({
  listRefundsReport: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
}));
vi.mock("@/modules/reports/finance/repositories/collections.repository", () => ({
  listCollectionsRows: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
}));
vi.mock("@/modules/reports/finance/repositories/wallet-activity.repository", () => ({
  listWalletActivityRows: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
}));
vi.mock("@/modules/reports/finance/repositories/course-revenue.repository", () => ({
  getCourseRevenueReport: vi.fn().mockResolvedValue({ rows: [], kpis: {}, monthlyTrend: [] }),
}));
vi.mock("@/modules/reports/finance/repositories/student-statement.repository", () => ({
  getStudentLedger: vi.fn().mockResolvedValue([]),
}));

// ── Route under test ──────────────────────────────────────────────────────────

import { GET } from "@/app/api/reports/finance/export/[reportType]/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function collectStream(body: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) result += decoder.decode(value, { stream: true });
  }
  result += decoder.decode();
  return result;
}

function makeReq(reportType: string, query: Record<string, string> = {}): NextRequest {
  const url = new URL(`http://localhost/api/reports/finance/export/${reportType}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
}

const FAKE_CTX = {
  userId: "user-1",
  organizationId: "org-1",
  ability: {},
  roles: [],
};

function makeArRow(overrides: Partial<{
  invoiceId: string;
  invoiceNumber: string;
  studentName: string | null;
  enrollmentNumber: string | null;
  courseName: string | null;
  branchName: string | null;
  issueDate: Date;
  dueDate: Date | null;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  status: string;
  daysOverdue: number;
  agingBucket: string;
  studentId: string | null;
  enrollmentId: string | null;
  courseId: string | null;
  branchId: string | null;
}> = {}) {
  return {
    invoiceId: "inv-1",
    invoiceNumber: "INV-001",
    studentName: "Maria Costa",
    enrollmentNumber: "MAT-001",
    courseName: "Condução B",
    branchName: "Norte",
    issueDate: new Date("2026-01-01"),
    dueDate: new Date("2026-02-01"),
    totalAmount: 1200,
    paidAmount: 0,
    balanceAmount: 1200,
    status: "PENDING",
    daysOverdue: 0,
    agingBucket: "current",
    studentId: "s-1",
    enrollmentId: "e-1",
    courseId: "c-1",
    branchId: "b-1",
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockRequirePermission.mockResolvedValue(FAKE_CTX);
  mockAuditLog.mockResolvedValue(undefined);
});

describe("GET /api/reports/finance/export/[reportType]", () => {
  function p(reportType: string) {
    return { params: Promise.resolve({ reportType }) };
  }

  describe("auth", () => {
    it("returns 401 when requirePermission throws", async () => {
      mockRequirePermission.mockRejectedValue(new Error("unauthorized"));
      const res = await GET(makeReq("accounts-receivable"), p("accounts-receivable"));
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Não autorizado");
    });
  });

  describe("unknown report type", () => {
    it("returns 400 for unknown reportType", async () => {
      const res = await GET(makeReq("unknown-type"), p("unknown-type"));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/inválido/i);
    });
  });

  describe("student-statement validation", () => {
    it("returns 400 when studentId is missing", async () => {
      const res = await GET(makeReq("student-statement"), p("student-statement"));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/studentId/);
    });
  });

  describe("accounts-receivable streaming", () => {
    it("returns 200 with correct Content-Type and Content-Disposition", async () => {
      mockListAccountsReceivable.mockResolvedValue({ rows: [makeArRow()], total: 1 });

      const res = await GET(makeReq("accounts-receivable"), p("accounts-receivable"));

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
      expect(res.headers.get("Content-Disposition")).toContain("contas-a-receber.csv");
    });

    it("sets X-Total-Count, X-Export-Limit, X-Truncated headers", async () => {
      mockListAccountsReceivable.mockResolvedValue({ rows: [makeArRow()], total: 42 });

      const res = await GET(makeReq("accounts-receivable"), p("accounts-receivable"));

      expect(res.headers.get("X-Total-Count")).toBe("42");
      expect(res.headers.get("X-Export-Limit")).toBe("5000");
      expect(res.headers.get("X-Truncated")).toBe("false");
    });

    it("sets X-Truncated: true when total exceeds MAX_EXPORT_ROWS", async () => {
      mockListAccountsReceivable.mockResolvedValue({ rows: [makeArRow()], total: 9999 });

      const res = await GET(makeReq("accounts-receivable"), p("accounts-receivable"));

      expect(res.headers.get("X-Truncated")).toBe("true");
    });

    it("response body is a ReadableStream", async () => {
      mockListAccountsReceivable.mockResolvedValue({ rows: [], total: 0 });

      const res = await GET(makeReq("accounts-receivable"), p("accounts-receivable"));

      expect(res.body).not.toBeNull();
      expect(typeof (res.body as ReadableStream<Uint8Array>).getReader).toBe("function");
    });

    it("first line of stream is the CSV header", async () => {
      mockListAccountsReceivable.mockResolvedValue({ rows: [], total: 0 });

      const res = await GET(makeReq("accounts-receivable"), p("accounts-receivable"));
      const csv = await collectStream(res.body!);
      const firstLine = csv.split("\r\n")[0];

      expect(firstLine).toBe(
        "Nº Fatura,Aluno,Matrícula,Curso,Filial,Data de Emissão,Data de Vencimento,Total,Pago,Saldo,Estado,Dias em Atraso,Escalão de Atraso"
      );
    });

    it("includes data rows after the header", async () => {
      const row = makeArRow({ invoiceNumber: "INV-042", studentName: "Ana Silva" });
      mockListAccountsReceivable.mockResolvedValue({ rows: [row], total: 1 });

      const res = await GET(makeReq("accounts-receivable"), p("accounts-receivable"));
      const csv = await collectStream(res.body!);
      const lines = csv.split("\r\n").filter(Boolean);

      expect(lines).toHaveLength(2); // header + 1 data row
      expect(lines[1]).toContain("INV-042");
      expect(lines[1]).toContain("Ana Silva");
    });

    it("fetches page 2 when first batch is exactly BATCH_SIZE (500 rows)", async () => {
      const batch1 = Array.from({ length: 500 }, (_, i) => makeArRow({ invoiceNumber: `INV-${i + 1}` }));
      const batch2 = [makeArRow({ invoiceNumber: "INV-501" })];

      mockListAccountsReceivable
        .mockResolvedValueOnce({ rows: batch1, total: 501 })
        .mockResolvedValueOnce({ rows: batch2, total: 501 });

      const res = await GET(makeReq("accounts-receivable"), p("accounts-receivable"));
      const csv = await collectStream(res.body!);
      const lines = csv.split("\r\n").filter(Boolean);

      expect(lines).toHaveLength(502); // header + 500 + 1
      expect(lines[501]).toContain("INV-501");
      expect(mockListAccountsReceivable).toHaveBeenCalledTimes(2);
    });

    it("does NOT fetch page 2 when first batch has fewer than BATCH_SIZE rows", async () => {
      mockListAccountsReceivable.mockResolvedValue({
        rows: [makeArRow(), makeArRow()],
        total: 2,
      });

      await GET(makeReq("accounts-receivable"), p("accounts-receivable"));

      expect(mockListAccountsReceivable).toHaveBeenCalledTimes(1);
    });

    it("stops streaming at MAX_EXPORT_ROWS (5000) regardless of total", async () => {
      // Every batch returns 500 rows — simulate an infinite dataset
      const fullBatch = Array.from({ length: 500 }, (_, i) => makeArRow({ invoiceNumber: `INV-${i}` }));
      mockListAccountsReceivable.mockResolvedValue({ rows: fullBatch, total: 99999 });

      const res = await GET(makeReq("accounts-receivable"), p("accounts-receivable"));
      const csv = await collectStream(res.body!);
      const lines = csv.split("\r\n").filter(Boolean);

      expect(lines).toHaveLength(5001); // header + 5000 rows
      expect(mockListAccountsReceivable).toHaveBeenCalledTimes(10); // 5000 / 500 = 10 pages
    });

    it("CSV-escapes values containing commas", async () => {
      const row = makeArRow({ studentName: "Costa, Ana" });
      mockListAccountsReceivable.mockResolvedValue({ rows: [row], total: 1 });

      const res = await GET(makeReq("accounts-receivable"), p("accounts-receivable"));
      const csv = await collectStream(res.body!);

      expect(csv).toContain('"Costa, Ana"');
    });

    it("CSV-escapes values containing double quotes", async () => {
      const row = makeArRow({ studentName: 'João "Técnico" Costa' });
      mockListAccountsReceivable.mockResolvedValue({ rows: [row], total: 1 });

      const res = await GET(makeReq("accounts-receivable"), p("accounts-receivable"));
      const csv = await collectStream(res.body!);

      expect(csv).toContain('"João ""Técnico"" Costa"');
    });

    it("logs the audit event with full metadata after preflight", async () => {
      mockListAccountsReceivable.mockResolvedValue({ rows: [], total: 7 });

      const res = await GET(
        makeReq("accounts-receivable", { branchId: "b-1" }),
        p("accounts-receivable")
      );
      // consume the stream so the audit call has been made
      await collectStream(res.body!);

      expect(mockAuditLog).toHaveBeenCalledOnce();
      const [, payload] = mockAuditLog.mock.calls[0];
      expect(payload.action).toBe("financial_report.exported");
      expect(payload.newValues.reportType).toBe("accounts-receivable");
      expect(payload.newValues.totalCount).toBe(7);
      expect(payload.newValues.rowLimit).toBe(5000);
      expect(payload.newValues.generatedBy).toBe("user-1");
    });
  });

  describe("integrity report streaming", () => {
    function makeIntegrityRow(overrides: Partial<{
      id: string; severity: string; category: string; checkName: string;
      entityType: string; entityId: string; description: string;
      expectedValue: string | null; actualValue: string | null;
      detectedAt: Date; status: string;
      resolvedAt: Date | null; resolvedBy: string | null; resolutionNotes: string | null;
    }> = {}) {
      return {
        id: "issue-1", severity: "HIGH", category: "BALANCE",
        checkName: "invoice_balance_check", entityType: "Invoice", entityId: "inv-1",
        description: "Balance mismatch", expectedValue: "0", actualValue: "100",
        detectedAt: new Date("2026-06-01"), status: "OPEN",
        resolvedAt: null, resolvedBy: null, resolutionNotes: null,
        ...overrides,
      };
    }

    it("streams with correct integrity headers", async () => {
      mockListIntegrityIssues.mockResolvedValue({ rows: [makeIntegrityRow()], total: 1 });

      const res = await GET(makeReq("integrity"), p("integrity"));
      const csv = await collectStream(res.body!);
      const lines = csv.split("\r\n").filter(Boolean);

      expect(lines[0]).toContain("Gravidade");
      expect(lines[0]).toContain("Categoria");
      expect(lines[1]).toContain("HIGH");
      expect(lines[1]).toContain("BALANCE");
    });

    it("paginates across multiple batches", async () => {
      const batch1 = Array.from({ length: 500 }, () => makeIntegrityRow());
      const batch2 = [makeIntegrityRow({ id: "issue-last" })];

      mockListIntegrityIssues
        .mockResolvedValueOnce({ rows: batch1, total: 501 })
        .mockResolvedValueOnce({ rows: batch2, total: 501 });

      const res = await GET(makeReq("integrity"), p("integrity"));
      const csv = await collectStream(res.body!);
      const lines = csv.split("\r\n").filter(Boolean);

      expect(lines).toHaveLength(502); // header + 501
      expect(mockListIntegrityIssues).toHaveBeenCalledTimes(2);
    });
  });

  describe("branch-revenue (aggregate, single fetch)", () => {
    const branches = [
      {
        branchId: "b-1", branchName: "Maputo",
        totalInvoiced: 10000, totalCollected: 8000,
        outstandingBalance: 2000, overdueBalance: 500,
        collectionRate: 80, paymentCount: 50, studentCount: 120,
      },
      {
        branchId: "b-2", branchName: "Beira",
        totalInvoiced: 5000, totalCollected: 4500,
        outstandingBalance: 500, overdueBalance: 0,
        collectionRate: 90, paymentCount: 25, studentCount: 60,
      },
    ];

    it("fetches only once and streams all branch rows", async () => {
      mockGetBranchRevenue.mockResolvedValue({ rows: branches, kpis: {}, monthlyTrend: [] });

      const res = await GET(makeReq("branch-revenue"), p("branch-revenue"));
      const csv = await collectStream(res.body!);
      const lines = csv.split("\r\n").filter(Boolean);

      expect(lines).toHaveLength(3); // header + 2 branch rows
      expect(lines[0]).toContain("Filial");
      expect(lines[1]).toContain("Maputo");
      expect(lines[2]).toContain("Beira");
      expect(mockGetBranchRevenue).toHaveBeenCalledTimes(1);
    });

    it("sets X-Total-Count to the number of branch rows", async () => {
      mockGetBranchRevenue.mockResolvedValue({ rows: branches, kpis: {}, monthlyTrend: [] });

      const res = await GET(makeReq("branch-revenue"), p("branch-revenue"));

      expect(res.headers.get("X-Total-Count")).toBe("2");
    });
  });

  describe("student-debt filter forwarding", () => {
    it("passes branchId, overdueOnly, and minBalance to the repository", async () => {
      mockListStudentDebtRows.mockResolvedValue({ rows: [], total: 0 });

      await GET(
        makeReq("student-debt", { branchId: "b-42", overdueOnly: "true", minBalance: "500" }),
        p("student-debt")
      );

      expect(mockListStudentDebtRows).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: "org-1",
          branchId: "b-42",
          overdueOnly: true,
          minBalance: 500,
        })
      );
    });
  });
});
