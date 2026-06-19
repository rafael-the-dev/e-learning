import { describe, it, expect, vi, beforeEach } from "vitest";
import { listAccountsReceivable, getAccountsReceivableKPIs } from "../repositories/accounts-receivable.repository";

// ---------------------------------------------------------------------------
// DB mock
// ---------------------------------------------------------------------------

const mockQueryRaw = vi.fn();

vi.mock("@/server/db", () => ({
  getDb: async () => ({
    $queryRaw: mockQueryRaw,
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE = { organizationId: "org-1", page: 1, pageSize: 20 } as const;

function rawRow(overrides: Partial<{
  id: string;
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date | null;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  status: string;
  studentId: string | null;
  branchId: string | null;
  enrollmentId: string | null;
  firstName: string | null;
  lastName: string | null;
  branchName: string | null;
  enrollmentNumber: string | null;
  courseId: string | null;
  courseName: string | null;
  daysOverdue: number;
  agingBucket: string;
}> = {}) {
  return {
    id: "inv-1",
    invoiceNumber: "INV-001",
    issueDate: new Date("2026-01-01"),
    dueDate: new Date("2026-02-01"),
    totalAmount: 1000,
    paidAmount: 200,
    balanceAmount: 800,
    status: "PENDING",
    studentId: "s1",
    branchId: "b1",
    enrollmentId: "e1",
    firstName: "Maria",
    lastName: "Costa",
    branchName: "Filial Norte",
    enrollmentNumber: "MAT-001",
    courseId: "c1",
    courseName: "Condução B",
    daysOverdue: 0,
    agingBucket: "current",
    ...overrides,
  };
}

function queueQueryRaw(rows: ReturnType<typeof rawRow>[], total: number) {
  mockQueryRaw
    .mockResolvedValueOnce(rows)
    .mockResolvedValueOnce([{ total: BigInt(total) }]);
}

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
// beforeEach
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

describe("listAccountsReceivable — row mapping", () => {
  it("maps raw SQL row to AccountsReceivableRow shape", async () => {
    queueQueryRaw([rawRow()], 1);

    const { rows, total } = await listAccountsReceivable(BASE);

    expect(total).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      invoiceId: "inv-1",
      invoiceNumber: "INV-001",
      studentName: "Maria Costa",
      branchName: "Filial Norte",
      courseName: "Condução B",
      enrollmentNumber: "MAT-001",
      totalAmount: 1000,
      paidAmount: 200,
      balanceAmount: 800,
      status: "PENDING",
      agingBucket: "current",
    });
  });

  it("returns null studentName when firstName is null", async () => {
    queueQueryRaw([rawRow({ firstName: null, lastName: null })], 1);

    const { rows } = await listAccountsReceivable(BASE);

    expect(rows[0].studentName).toBeNull();
  });

  it("returns the count from the count query, not the rows length", async () => {
    queueQueryRaw(
      Array.from({ length: 20 }, (_, i) => rawRow({ id: `inv-${i}` })),
      250
    );

    const { total } = await listAccountsReceivable(BASE);

    expect(total).toBe(250);
  });
});

// ---------------------------------------------------------------------------
// No full-table scan
// ---------------------------------------------------------------------------

describe("listAccountsReceivable — no full-table scan", () => {
  it("uses $queryRaw for main query — never calls invoice.findMany", async () => {
    queueQueryRaw([rawRow()], 1);

    await listAccountsReceivable(BASE);

    expect(mockQueryRaw).toHaveBeenCalled();
  });

  it("calls $queryRaw exactly twice (main query + count query)", async () => {
    queueQueryRaw([rawRow()], 1);

    await listAccountsReceivable(BASE);

    expect(mockQueryRaw).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Aging bucket — SQL calculation
// ---------------------------------------------------------------------------

describe("listAccountsReceivable — aging bucket in SQL", () => {
  it("includes CASE WHEN aging bucket expression in the SELECT", async () => {
    queueQueryRaw([rawRow()], 1);

    await listAccountsReceivable(BASE);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("DATEDIFF(day, i.dueDate, GETDATE())");
    expect(sql).toContain("CASE");
    expect(sql).toContain("'current'");
    expect(sql).toContain("'1-30'");
    expect(sql).toContain("'31-60'");
    expect(sql).toContain("'61-90'");
    expect(sql).toContain("'90+'");
  });

  it("agingBucket='current' filter adds dueDate IS NULL OR dueDate >= GETDATE() clause", async () => {
    queueQueryRaw([rawRow()], 1);

    await listAccountsReceivable({ ...BASE, agingBucket: "current" });

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("i.dueDate IS NULL OR i.dueDate >=");
  });

  it("agingBucket='1-30' filter pushes DATEDIFF BETWEEN 1 AND 30 to SQL WHERE", async () => {
    queueQueryRaw([rawRow({ agingBucket: "1-30", daysOverdue: 15 })], 1);

    await listAccountsReceivable({ ...BASE, agingBucket: "1-30" });

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("DATEDIFF(day, i.dueDate, GETDATE()) BETWEEN 1 AND 30");
  });

  it("agingBucket='31-60' filter pushes BETWEEN 31 AND 60 to SQL WHERE", async () => {
    queueQueryRaw([rawRow({ agingBucket: "31-60", daysOverdue: 45 })], 1);

    await listAccountsReceivable({ ...BASE, agingBucket: "31-60" });

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("DATEDIFF(day, i.dueDate, GETDATE()) BETWEEN 31 AND 60");
  });

  it("agingBucket='61-90' filter pushes BETWEEN 61 AND 90 to SQL WHERE", async () => {
    queueQueryRaw([rawRow({ agingBucket: "61-90", daysOverdue: 75 })], 1);

    await listAccountsReceivable({ ...BASE, agingBucket: "61-90" });

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("DATEDIFF(day, i.dueDate, GETDATE()) BETWEEN 61 AND 90");
  });

  it("agingBucket='90+' filter pushes DATEDIFF > 90 to SQL WHERE", async () => {
    queueQueryRaw([rawRow({ agingBucket: "90+", daysOverdue: 120 })], 1);

    await listAccountsReceivable({ ...BASE, agingBucket: "90+" });

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("DATEDIFF(day, i.dueDate, GETDATE()) > 90");
  });

  it("no agingBucket filter means no extra bucket predicate is added to WHERE", async () => {
    queueQueryRaw([rawRow()], 1);

    await listAccountsReceivable(BASE);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    // The SELECT's CASE expression always computes the bucket label per row (for display),
    // so each BETWEEN pattern legitimately appears once from there. Without an agingBucket
    // filter, agingBucketClause() must NOT add a second occurrence via the WHERE clause.
    const count = (pattern: string) => sql.split(pattern).length - 1;
    expect(count("BETWEEN 1 AND 30")).toBe(1);
    expect(count("BETWEEN 31 AND 60")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// SQL filters
// ---------------------------------------------------------------------------

describe("listAccountsReceivable — SQL filters", () => {
  it("excludes CANCELLED and PAID via NOT IN in SQL", async () => {
    queueQueryRaw([rawRow()], 1);

    await listAccountsReceivable(BASE);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("NOT IN ('CANCELLED', 'PAID')");
  });

  it("excludes zero-balance invoices via FLOAT > 0 in SQL", async () => {
    queueQueryRaw([rawRow()], 1);

    await listAccountsReceivable(BASE);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("CAST(i.balanceAmount AS FLOAT) > 0");
  });

  it("soft-delete guard is in SQL", async () => {
    queueQueryRaw([rawRow()], 1);

    await listAccountsReceivable(BASE);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("i.deletedAt IS NULL");
  });

  it("invoiceStatus overrides the NOT IN default with exact match", async () => {
    queueQueryRaw([rawRow({ status: "OVERDUE" })], 1);

    await listAccountsReceivable({ ...BASE, invoiceStatus: "OVERDUE" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("i.status =");
    expect(values).toContain("OVERDUE");
    expect(sql).not.toContain("NOT IN ('CANCELLED', 'PAID')");
  });

  it("branchId filter is passed as a bound parameter", async () => {
    queueQueryRaw([rawRow()], 1);

    await listAccountsReceivable({ ...BASE, branchId: "branch-xyz" });

    const { values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(values).toContain("branch-xyz");
  });

  it("courseId filter uses EXISTS subquery into enrollments", async () => {
    queueQueryRaw([rawRow()], 1);

    await listAccountsReceivable({ ...BASE, courseId: "course-x" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("EXISTS");
    expect(sql).toContain("enrollments");
    expect(values).toContain("course-x");
  });

  it("academicYearId filter uses EXISTS into enrollments", async () => {
    queueQueryRaw([rawRow()], 1);

    await listAccountsReceivable({ ...BASE, academicYearId: "year-1" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("academicYearId");
    expect(values).toContain("year-1");
  });

  it("academicTermId filter uses EXISTS into enrollments", async () => {
    queueQueryRaw([rawRow()], 1);

    await listAccountsReceivable({ ...BASE, academicTermId: "term-1" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("academicTermId");
    expect(values).toContain("term-1");
  });

  it("escapes SQL Server LIKE metacharacters in search", async () => {
    queueQueryRaw([rawRow()], 1);

    await listAccountsReceivable({ ...BASE, search: "test_50%[a]" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("ESCAPE");
    const param = values.find((v) => typeof v === "string" && (v as string).startsWith("%")) as string;
    expect(param).toContain("\\_");
    expect(param).toContain("\\%");
    expect(param).toContain("\\[");
  });
});

// ---------------------------------------------------------------------------
// Pagination in SQL
// ---------------------------------------------------------------------------

describe("listAccountsReceivable — pagination in SQL", () => {
  it("uses OFFSET / FETCH NEXT in SQL", async () => {
    queueQueryRaw([rawRow()], 100);

    await listAccountsReceivable({ ...BASE, page: 3, pageSize: 10 });

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("OFFSET");
    expect(sql).toContain("ROWS FETCH NEXT");
  });

  it("OFFSET is (page-1)*pageSize bound as a parameter", async () => {
    queueQueryRaw([rawRow()], 100);

    await listAccountsReceivable({ ...BASE, page: 3, pageSize: 10 });

    const { values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(values).toContain(20); // skip = (3-1)*10
    expect(values).toContain(10); // pageSize
  });
});

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

describe("listAccountsReceivable — sort", () => {
  it("defaults to dueDate ASC when no sortBy specified", async () => {
    queueQueryRaw([rawRow()], 1);

    await listAccountsReceivable(BASE);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("i.dueDate ASC");
  });

  it("sorts by balanceAmount when sortBy=balanceAmount", async () => {
    queueQueryRaw([rawRow()], 1);

    await listAccountsReceivable({ ...BASE, sortBy: "balanceAmount" });

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("CAST(i.balanceAmount AS FLOAT)");
  });

  it("sorts by daysOverdue when sortBy=daysOverdue", async () => {
    queueQueryRaw([rawRow()], 1);

    await listAccountsReceivable({ ...BASE, sortBy: "daysOverdue" });

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("DATEDIFF(day, i.dueDate, GETDATE())");
  });

  it("respects sortDir=desc", async () => {
    queueQueryRaw([rawRow()], 1);

    await listAccountsReceivable({ ...BASE, sortBy: "balanceAmount", sortDir: "desc" });

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("DESC");
  });
});

// ---------------------------------------------------------------------------
// Tenant isolation
// ---------------------------------------------------------------------------

describe("listAccountsReceivable — tenant isolation", () => {
  it("organizationId is bound as a parameter, never string-interpolated", async () => {
    queueQueryRaw([rawRow()], 1);

    await listAccountsReceivable({ ...BASE, organizationId: "org-secure" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(values).toContain("org-secure");
    expect(sql).not.toContain("org-secure");
  });
});

// ---------------------------------------------------------------------------
// KPI — SQL aggregation
// ---------------------------------------------------------------------------

describe("getAccountsReceivableKPIs — SQL aggregation", () => {
  function kpiRow(overrides: Partial<{
    totalReceivable: number;
    overdueReceivable: number;
    dueSoon: number;
    partiallyPaid: number;
    studentsWithDebt: number;
    invoiceCount: number;
  }> = {}) {
    return {
      totalReceivable:   0,
      overdueReceivable: 0,
      dueSoon:           0,
      partiallyPaid:     0,
      studentsWithDebt:  0,
      invoiceCount:      0,
      ...overrides,
    };
  }

  it("uses a single $queryRaw call (no findMany)", async () => {
    mockQueryRaw.mockResolvedValueOnce([kpiRow()]);

    await getAccountsReceivableKPIs(BASE);

    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
  });

  it("reads totalReceivable from SQL SUM", async () => {
    mockQueryRaw.mockResolvedValueOnce([kpiRow({ totalReceivable: 55000 })]);

    const result = await getAccountsReceivableKPIs(BASE);

    expect(result.totalReceivable).toBe(55000);
  });

  it("reads overdueReceivable from SQL conditional SUM", async () => {
    mockQueryRaw.mockResolvedValueOnce([kpiRow({ overdueReceivable: 12000 })]);

    const result = await getAccountsReceivableKPIs(BASE);

    expect(result.overdueReceivable).toBe(12000);
  });

  it("reads dueSoon from SQL conditional SUM", async () => {
    mockQueryRaw.mockResolvedValueOnce([kpiRow({ dueSoon: 3000 })]);

    const result = await getAccountsReceivableKPIs(BASE);

    expect(result.dueSoon).toBe(3000);
  });

  it("reads studentsWithDebt from SQL COUNT(DISTINCT)", async () => {
    mockQueryRaw.mockResolvedValueOnce([kpiRow({ studentsWithDebt: 42 })]);

    const result = await getAccountsReceivableKPIs(BASE);

    expect(result.studentsWithDebt).toBe(42);
  });

  it("returns zeros for all fields when aggregation returns null", async () => {
    mockQueryRaw.mockResolvedValueOnce([undefined]);

    const result = await getAccountsReceivableKPIs(BASE);

    expect(result.totalReceivable).toBe(0);
    expect(result.overdueReceivable).toBe(0);
    expect(result.studentsWithDebt).toBe(0);
  });

  it("includes conditional SUM for overdue in SQL", async () => {
    mockQueryRaw.mockResolvedValueOnce([kpiRow()]);

    await getAccountsReceivableKPIs(BASE);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("i.dueDate < GETDATE()");
    expect(sql).toContain("CAST(i.balanceAmount AS FLOAT)");
  });

  it("organizationId is bound as a parameter in KPI query", async () => {
    mockQueryRaw.mockResolvedValueOnce([kpiRow()]);

    await getAccountsReceivableKPIs({ ...BASE, organizationId: "org-kpi" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(values).toContain("org-kpi");
    expect(sql).not.toContain("org-kpi");
  });
});
