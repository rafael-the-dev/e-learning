import { describe, it, expect, vi, beforeEach } from "vitest";
import { listStudentDebtRows, getStudentDebtKPIs } from "../repositories/student-debt.repository";

// ---------------------------------------------------------------------------
// DB mock
// ---------------------------------------------------------------------------

const mockQueryRaw = vi.fn();
const mockInvoiceFindMany = vi.fn();
const mockInvoiceAggregate = vi.fn();
const mockInvoiceGroupBy = vi.fn();

vi.mock("@/server/db", () => ({
  getDb: async () => ({
    $queryRaw: mockQueryRaw,
    invoice: {
      findMany: mockInvoiceFindMany,
      aggregate: mockInvoiceAggregate,
      groupBy: mockInvoiceGroupBy,
    },
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE = { organizationId: "org-1", page: 1, pageSize: 20 } as const;

function rawRow(
  overrides: Partial<{
    studentId: string;
    firstName: string;
    lastName: string;
    studentCode: string | null;
    totalInvoiced: number;
    totalPaid: number;
    outstandingBalance: number;
    overdueBalance: number;
    invoiceCount: bigint;
    longestOverdueDays: number;
  }> = {}
) {
  return {
    studentId: "s1",
    firstName: "Maria",
    lastName: "Costa",
    studentCode: "STU001",
    totalInvoiced: 1000,
    totalPaid: 200,
    outstandingBalance: 800,
    overdueBalance: 500,
    invoiceCount: BigInt(3),
    longestOverdueDays: 45,
    ...overrides,
  };
}

/** Queue exactly two $queryRaw responses: main rows then count. */
function queueQueryRaw(rows: ReturnType<typeof rawRow>[], total: number) {
  mockQueryRaw
    .mockResolvedValueOnce(rows)
    .mockResolvedValueOnce([{ total: BigInt(total) }]);
}

/** Flatten a Prisma.Sql tree into { sql, values } for assertion. */
function flattenSql(node: unknown): { sql: string; values: unknown[] } {
  const sqlParts: string[] = [];
  const values: unknown[] = [];

  function walk(n: unknown) {
    if (!n || typeof n !== "object") return;
    const obj = n as Record<string, unknown>;
    if (!Array.isArray(obj.strings)) return;
    const strings = obj.strings as string[];
    const vals = (obj.values ?? []) as unknown[];
    for (let i = 0; i < strings.length; i++) {
      sqlParts.push(strings[i]);
      if (i < vals.length) {
        const v = vals[i];
        if (v && typeof v === "object" && Array.isArray((v as Record<string, unknown>).strings)) {
          walk(v);
        } else {
          values.push(v);
        }
      }
    }
  }

  walk(node);
  return { sql: sqlParts.join(""), values };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockInvoiceFindMany.mockResolvedValue([]);
  mockInvoiceAggregate.mockResolvedValue({ _sum: { balanceAmount: null } });
  mockInvoiceGroupBy.mockResolvedValue([]);
});

describe("listStudentDebtRows — correctness", () => {
  it("maps raw SQL row to StudentDebtRow shape", async () => {
    queueQueryRaw([rawRow()], 1);

    const { rows, total } = await listStudentDebtRows(BASE);

    expect(total).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      studentId: "s1",
      studentName: "Maria Costa",
      studentCode: "STU001",
      totalInvoiced: 1000,
      totalPaid: 200,
      outstandingBalance: 800,
      overdueBalance: 500,
      invoiceCount: 3,
      longestOverdueDays: 45,
    });
  });

  it("converts BigInt invoiceCount to number", async () => {
    queueQueryRaw([rawRow({ invoiceCount: BigInt(99) })], 1);

    const { rows } = await listStudentDebtRows(BASE);

    expect(typeof rows[0].invoiceCount).toBe("number");
    expect(rows[0].invoiceCount).toBe(99);
  });

  it("returns the count from the count query, not the rows length", async () => {
    queueQueryRaw(
      Array.from({ length: 20 }, (_, i) => rawRow({ studentId: `s${i}` })),
      150
    );

    const { total } = await listStudentDebtRows(BASE);

    expect(total).toBe(150);
  });

  it("returns empty rows without calling findMany when main query returns nothing", async () => {
    queueQueryRaw([], 0);

    const { rows, total } = await listStudentDebtRows(BASE);

    expect(rows).toHaveLength(0);
    expect(total).toBe(0);
    expect(mockInvoiceFindMany).not.toHaveBeenCalled();
  });

  it("attaches course and branch names from enrichment", async () => {
    queueQueryRaw([rawRow({ studentId: "s1" })], 1);
    mockInvoiceFindMany.mockResolvedValue([
      { studentId: "s1", branch: { name: "Filial Norte" }, enrollment: { course: { name: "Condução B" } } },
      { studentId: "s1", branch: null, enrollment: { course: { name: "Condução A" } } },
    ]);

    const { rows } = await listStudentDebtRows(BASE);

    expect(rows[0].courseNames).toContain("Condução B");
    expect(rows[0].courseNames).toContain("Condução A");
    expect(rows[0].branchNames).toContain("Filial Norte");
  });

  it("deduplicates course and branch names", async () => {
    queueQueryRaw([rawRow({ studentId: "s1" })], 1);
    mockInvoiceFindMany.mockResolvedValue([
      { studentId: "s1", branch: { name: "Filial Norte" }, enrollment: { course: { name: "Condução B" } } },
      { studentId: "s1", branch: { name: "Filial Norte" }, enrollment: { course: { name: "Condução B" } } },
    ]);

    const { rows } = await listStudentDebtRows(BASE);

    expect(rows[0].courseNames).toHaveLength(1);
    expect(rows[0].branchNames).toHaveLength(1);
  });
});

describe("listStudentDebtRows — no full-table scan", () => {
  it("uses $queryRaw for main aggregation, not invoice.findMany", async () => {
    queueQueryRaw([rawRow()], 1);

    await listStudentDebtRows(BASE);

    expect(mockQueryRaw).toHaveBeenCalled();
  });

  it("calls $queryRaw exactly twice (main query + count query)", async () => {
    queueQueryRaw([rawRow()], 1);

    await listStudentDebtRows(BASE);

    expect(mockQueryRaw).toHaveBeenCalledTimes(2);
  });
});

describe("listStudentDebtRows — no N+1", () => {
  it("calls findMany exactly once for enrichment regardless of page size", async () => {
    queueQueryRaw(
      [rawRow({ studentId: "s1" }), rawRow({ studentId: "s2" }), rawRow({ studentId: "s3" })],
      3
    );

    await listStudentDebtRows(BASE);

    expect(mockInvoiceFindMany).toHaveBeenCalledTimes(1);
  });

  it("passes all paginated studentIds in a single IN clause", async () => {
    queueQueryRaw(
      [rawRow({ studentId: "s1" }), rawRow({ studentId: "s2" })],
      2
    );

    await listStudentDebtRows(BASE);

    const [call] = mockInvoiceFindMany.mock.calls;
    expect(call[0].where.studentId).toEqual({ in: ["s1", "s2"] });
  });
});

describe("listStudentDebtRows — SQL filters", () => {
  it("excludes CANCELLED and PAID invoices via SQL (NOT IN clause)", async () => {
    queueQueryRaw([rawRow()], 1);

    await listStudentDebtRows(BASE);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("NOT IN ('CANCELLED', 'PAID')");
  });

  it("excludes invoices with zero balance via SQL", async () => {
    queueQueryRaw([rawRow()], 1);

    await listStudentDebtRows(BASE);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("CAST(i.balanceAmount AS FLOAT) > 0");
  });

  it("calculates overdueBalance in SQL with CASE WHEN", async () => {
    queueQueryRaw([rawRow()], 1);

    await listStudentDebtRows(BASE);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("CASE WHEN i.dueDate < GETDATE() OR i.status = 'OVERDUE'");
  });

  it("calculates longestOverdueDays in SQL with DATEDIFF", async () => {
    queueQueryRaw([rawRow()], 1);

    await listStudentDebtRows(BASE);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("DATEDIFF(day, i.dueDate, GETDATE())");
  });

  it("overdueOnly filter adds GETDATE() dueDate condition", async () => {
    queueQueryRaw([rawRow()], 1);

    await listStudentDebtRows({ ...BASE, overdueOnly: true });

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    // The WHERE clause must include the overdue predicate
    expect(sql).toContain("i.dueDate < GETDATE()");
  });

  it("minBalance filter is passed as a bound parameter", async () => {
    queueQueryRaw([rawRow()], 1);

    await listStudentDebtRows({ ...BASE, minBalance: 500 });

    const { values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(values).toContain(500);
  });

  it("branchId filter is passed as a bound parameter", async () => {
    queueQueryRaw([rawRow()], 1);

    await listStudentDebtRows({ ...BASE, branchId: "branch-x" });

    const { values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(values).toContain("branch-x");
  });

  it("courseId filter uses EXISTS subquery into enrollments table", async () => {
    queueQueryRaw([rawRow()], 1);

    await listStudentDebtRows({ ...BASE, courseId: "course-x" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("EXISTS");
    expect(sql).toContain("enrollments");
    expect(values).toContain("course-x");
  });

  it("academicYearId filter uses EXISTS subquery into enrollments table", async () => {
    queueQueryRaw([rawRow()], 1);

    await listStudentDebtRows({ ...BASE, academicYearId: "year-1" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("EXISTS");
    expect(sql).toContain("academicYearId");
    expect(values).toContain("year-1");
  });

  it("academicTermId filter uses EXISTS subquery into enrollments table", async () => {
    queueQueryRaw([rawRow()], 1);

    await listStudentDebtRows({ ...BASE, academicTermId: "term-1" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("academicTermId");
    expect(values).toContain("term-1");
  });

  it("escapes SQL Server LIKE metacharacters in search filter", async () => {
    queueQueryRaw([rawRow()], 1);

    await listStudentDebtRows({ ...BASE, search: "costa_50%" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("ESCAPE");
    const searchParam = values.find((v) => typeof v === "string" && (v as string).startsWith("%")) as string;
    // _ and % in the original must be escaped with \ in the bound parameter
    expect(searchParam).toContain("\\_");
    expect(searchParam).toContain("\\%");
  });
});

describe("listStudentDebtRows — pagination in SQL", () => {
  it("uses OFFSET / FETCH NEXT in SQL — not JS slice", async () => {
    queueQueryRaw([rawRow()], 100);

    await listStudentDebtRows({ ...BASE, page: 3, pageSize: 10 });

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("OFFSET");
    expect(sql).toContain("ROWS FETCH NEXT");
  });

  it("OFFSET is (page-1)*pageSize bound as a parameter", async () => {
    queueQueryRaw([rawRow()], 100);

    // page=3, pageSize=10 → skip=20
    await listStudentDebtRows({ ...BASE, page: 3, pageSize: 10 });

    const { values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(values).toContain(20); // skip
    expect(values).toContain(10); // pageSize
  });
});

describe("listStudentDebtRows — sort", () => {
  it("defaults to outstandingBalance DESC when no sort specified", async () => {
    queueQueryRaw([rawRow()], 1);

    await listStudentDebtRows(BASE);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("SUM(CAST(i.balanceAmount AS FLOAT))");
    expect(sql).toContain("DESC");
  });

  it("sorts by overdueBalance when sortBy=overdueBalance", async () => {
    queueQueryRaw([rawRow()], 1);

    await listStudentDebtRows({ ...BASE, sortBy: "overdueBalance" });

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("SUM(CASE WHEN i.dueDate < GETDATE() OR i.status = 'OVERDUE'");
  });

  it("sorts by longestOverdueDays when sortBy=longestOverdueDays", async () => {
    queueQueryRaw([rawRow()], 1);

    await listStudentDebtRows({ ...BASE, sortBy: "longestOverdueDays" });

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("MAX(CASE WHEN i.dueDate < GETDATE()");
  });

  it("respects sortDir=asc", async () => {
    queueQueryRaw([rawRow()], 1);

    await listStudentDebtRows({ ...BASE, sortDir: "asc" });

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("ASC");
    expect(sql).not.toMatch(/SUM\(CAST\(i\.balanceAmount AS FLOAT\)\) DESC/);
  });
});

describe("listStudentDebtRows — tenant isolation", () => {
  it("organizationId is always bound as a parameter, never string-interpolated", async () => {
    queueQueryRaw([rawRow()], 1);

    await listStudentDebtRows({ ...BASE, organizationId: "org-safe" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    // Must appear in values (parameterized)
    expect(values).toContain("org-safe");
    // Must NOT appear literally in the SQL template (would indicate string concatenation)
    expect(sql).not.toContain("org-safe");
  });

  it("enrichment findMany always filters by organizationId", async () => {
    queueQueryRaw([rawRow({ studentId: "s1" })], 1);

    await listStudentDebtRows({ ...BASE, organizationId: "org-safe" });

    const [enrichArgs] = mockInvoiceFindMany.mock.calls[0];
    expect(enrichArgs.where.organizationId).toBe("org-safe");
  });

  it("enrichment findMany scopes to the paginated studentIds only", async () => {
    queueQueryRaw(
      [rawRow({ studentId: "s-page1" })],
      50
    );

    await listStudentDebtRows(BASE);

    const [enrichArgs] = mockInvoiceFindMany.mock.calls[0];
    expect(enrichArgs.where.studentId).toEqual({ in: ["s-page1"] });
  });
});

// ---------------------------------------------------------------------------
// KPI helpers
// ---------------------------------------------------------------------------

function makeDecimal(v: number) {
  return { toNumber: () => v };
}

type KpiStudentRow = {
  studentId: string;
  _sum: { balanceAmount: ReturnType<typeof makeDecimal> | null };
  _min: { dueDate: Date | null };
};

function queueKpiMocks({
  totalBalance = 0,
  overdueBalance = 0,
  byStudent = [] as KpiStudentRow[],
} = {}) {
  mockInvoiceAggregate
    .mockResolvedValueOnce({ _sum: { balanceAmount: makeDecimal(totalBalance) } })
    .mockResolvedValueOnce({ _sum: { balanceAmount: makeDecimal(overdueBalance) } });
  mockInvoiceGroupBy.mockResolvedValueOnce(byStudent);
}

describe("getStudentDebtKPIs — KPI accuracy", () => {
  it("returns total outstanding from aggregate sum", async () => {
    queueKpiMocks({ totalBalance: 12500 });

    const kpis = await getStudentDebtKPIs(BASE);

    expect(kpis.totalOutstanding).toBe(12500);
  });

  it("returns overdue outstanding from overdue aggregate sum", async () => {
    queueKpiMocks({ overdueBalance: 4750 });

    const kpis = await getStudentDebtKPIs(BASE);

    expect(kpis.overdueOutstanding).toBe(4750);
  });

  it("counts students with debt from groupBy row count", async () => {
    queueKpiMocks({
      byStudent: [
        { studentId: "s1", _sum: { balanceAmount: makeDecimal(100) }, _min: { dueDate: null } },
        { studentId: "s2", _sum: { balanceAmount: makeDecimal(200) }, _min: { dueDate: null } },
        { studentId: "s3", _sum: { balanceAmount: makeDecimal(50) }, _min: { dueDate: null } },
      ],
    });

    const kpis = await getStudentDebtKPIs(BASE);

    expect(kpis.studentsWithDebt).toBe(3);
  });

  it("returns largest debtor balance from first groupBy row (ordered by balance desc)", async () => {
    queueKpiMocks({
      byStudent: [
        { studentId: "s1", _sum: { balanceAmount: makeDecimal(9000) }, _min: { dueDate: null } },
        { studentId: "s2", _sum: { balanceAmount: makeDecimal(500) }, _min: { dueDate: null } },
      ],
    });

    const kpis = await getStudentDebtKPIs(BASE);

    expect(kpis.largestDebtorBalance).toBe(9000);
  });

  it("calculates longestOverdueDays from _min dueDate (earliest past-due = most overdue)", async () => {
    const pastDate = new Date(Date.now() - 30 * 86_400_000); // 30 days ago

    queueKpiMocks({
      byStudent: [
        { studentId: "s1", _sum: { balanceAmount: makeDecimal(100) }, _min: { dueDate: pastDate } },
      ],
    });

    const kpis = await getStudentDebtKPIs(BASE);

    expect(kpis.longestOverdueDays).toBeGreaterThanOrEqual(29);
    expect(kpis.longestOverdueDays).toBeLessThanOrEqual(31);
  });

  it("returns 0 longestOverdueDays when all _min dueDates are null", async () => {
    queueKpiMocks({
      byStudent: [
        { studentId: "s1", _sum: { balanceAmount: makeDecimal(100) }, _min: { dueDate: null } },
      ],
    });

    const kpis = await getStudentDebtKPIs(BASE);

    expect(kpis.longestOverdueDays).toBe(0);
  });

  it("excludes PAID and CANCELLED invoices in aggregate where", async () => {
    queueKpiMocks();

    await getStudentDebtKPIs(BASE);

    const [totalCall] = mockInvoiceAggregate.mock.calls;
    expect(totalCall[0].where.status).toEqual({ notIn: ["CANCELLED", "PAID"] });
  });

  it("scopes all aggregate and groupBy calls to the organizationId", async () => {
    queueKpiMocks();

    await getStudentDebtKPIs({ ...BASE, organizationId: "org-xyz" });

    for (const call of mockInvoiceAggregate.mock.calls) {
      expect(call[0].where.organizationId).toBe("org-xyz");
    }
    const [groupByCall] = mockInvoiceGroupBy.mock.calls;
    expect(groupByCall[0].where.organizationId).toBe("org-xyz");
  });
});
