import { describe, it, expect, vi, beforeEach } from "vitest";
import { listAgingRows, getAgingKPIs } from "../repositories/aging.repository";

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
  dueDate: Date | null;
  balanceAmount: number;
  studentId: string | null;
  branchId: string | null;
  firstName: string | null;
  lastName: string | null;
  branchName: string | null;
  courseId: string | null;
  courseName: string | null;
  daysOverdue: number;
  agingBucket: string;
}> = {}) {
  return {
    id: "inv-1",
    invoiceNumber: "INV-001",
    dueDate: new Date("2026-05-01"),
    balanceAmount: 500,
    studentId: "s1",
    branchId: "b1",
    firstName: "Ana",
    lastName: "Silva",
    branchName: "Filial Sul",
    courseId: "c1",
    courseName: "Condução A",
    daysOverdue: 0,
    agingBucket: "current",
    ...overrides,
  };
}

function queueRowRaw(rows: ReturnType<typeof rawRow>[], total: number) {
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

describe("listAgingRows — row mapping", () => {
  it("maps raw SQL row to AgingRow shape", async () => {
    queueRowRaw([rawRow({ agingBucket: "1-30", daysOverdue: 15 })], 1);

    const { rows, total } = await listAgingRows(BASE);

    expect(total).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      invoiceId: "inv-1",
      invoiceNumber: "INV-001",
      studentName: "Ana Silva",
      branchName: "Filial Sul",
      courseName: "Condução A",
      balanceAmount: 500,
      daysOverdue: 15,
      agingBucket: "1-30",
    });
  });

  it("returns null studentName when firstName is null", async () => {
    queueRowRaw([rawRow({ firstName: null, lastName: null })], 1);

    const { rows } = await listAgingRows(BASE);

    expect(rows[0].studentName).toBeNull();
  });

  it("returns the count from the count query, not the rows length", async () => {
    queueRowRaw(
      Array.from({ length: 20 }, (_, i) => rawRow({ id: `inv-${i}` })),
      300
    );

    const { total } = await listAgingRows(BASE);

    expect(total).toBe(300);
  });
});

// ---------------------------------------------------------------------------
// No full-table scan
// ---------------------------------------------------------------------------

describe("listAgingRows — no full-table scan", () => {
  it("uses $queryRaw — never calls invoice.findMany", async () => {
    queueRowRaw([rawRow()], 1);

    await listAgingRows(BASE);

    expect(mockQueryRaw).toHaveBeenCalled();
  });

  it("calls $queryRaw exactly twice (main query + count query)", async () => {
    queueRowRaw([rawRow()], 1);

    await listAgingRows(BASE);

    expect(mockQueryRaw).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Aging bucket — SQL CASE calculation
// ---------------------------------------------------------------------------

describe("listAgingRows — aging bucket in SQL", () => {
  it("SELECT includes CASE WHEN aging bucket expression", async () => {
    queueRowRaw([rawRow()], 1);

    await listAgingRows(BASE);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("DATEDIFF(day, i.dueDate, GETDATE())");
    expect(sql).toContain("'current'");
    expect(sql).toContain("'1-30'");
    expect(sql).toContain("'31-60'");
    expect(sql).toContain("'61-90'");
    expect(sql).toContain("'90+'");
  });

  it("agingBucket='current' filter is pushed to SQL WHERE", async () => {
    queueRowRaw([rawRow({ agingBucket: "current" })], 1);

    await listAgingRows({ ...BASE, agingBucket: "current" });

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("i.dueDate IS NULL OR i.dueDate >=");
  });

  it("agingBucket='1-30' filter is pushed to SQL WHERE — no JS filtering", async () => {
    queueRowRaw([rawRow({ agingBucket: "1-30", daysOverdue: 20 })], 1);

    await listAgingRows({ ...BASE, agingBucket: "1-30" });

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("DATEDIFF(day, i.dueDate, GETDATE()) BETWEEN 1 AND 30");
  });

  it("agingBucket='31-60' filter is pushed to SQL WHERE", async () => {
    queueRowRaw([rawRow({ agingBucket: "31-60", daysOverdue: 45 })], 1);

    await listAgingRows({ ...BASE, agingBucket: "31-60" });

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("DATEDIFF(day, i.dueDate, GETDATE()) BETWEEN 31 AND 60");
  });

  it("agingBucket='61-90' filter is pushed to SQL WHERE", async () => {
    queueRowRaw([rawRow({ agingBucket: "61-90", daysOverdue: 75 })], 1);

    await listAgingRows({ ...BASE, agingBucket: "61-90" });

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("DATEDIFF(day, i.dueDate, GETDATE()) BETWEEN 61 AND 90");
  });

  it("agingBucket='90+' filter is pushed to SQL WHERE", async () => {
    queueRowRaw([rawRow({ agingBucket: "90+", daysOverdue: 120 })], 1);

    await listAgingRows({ ...BASE, agingBucket: "90+" });

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("DATEDIFF(day, i.dueDate, GETDATE()) > 90");
  });
});

// ---------------------------------------------------------------------------
// SQL filters
// ---------------------------------------------------------------------------

describe("listAgingRows — SQL filters", () => {
  it("excludes CANCELLED and PAID via NOT IN in SQL", async () => {
    queueRowRaw([rawRow()], 1);

    await listAgingRows(BASE);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("NOT IN ('CANCELLED', 'PAID')");
  });

  it("excludes zero-balance invoices in SQL", async () => {
    queueRowRaw([rawRow()], 1);

    await listAgingRows(BASE);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("CAST(i.balanceAmount AS FLOAT) > 0");
  });

  it("soft-delete guard is in SQL", async () => {
    queueRowRaw([rawRow()], 1);

    await listAgingRows(BASE);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("i.deletedAt IS NULL");
  });

  it("branchId is passed as a bound parameter", async () => {
    queueRowRaw([rawRow()], 1);

    await listAgingRows({ ...BASE, branchId: "branch-abc" });

    const { values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(values).toContain("branch-abc");
  });

  it("courseId filter uses EXISTS into enrollments", async () => {
    queueRowRaw([rawRow()], 1);

    await listAgingRows({ ...BASE, courseId: "course-z" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("EXISTS");
    expect(sql).toContain("enrollments");
    expect(values).toContain("course-z");
  });

  it("escapes SQL Server LIKE metacharacters in search", async () => {
    queueRowRaw([rawRow()], 1);

    await listAgingRows({ ...BASE, search: "silva_30%[b]" });

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

describe("listAgingRows — pagination in SQL", () => {
  it("uses OFFSET / FETCH NEXT in SQL", async () => {
    queueRowRaw([rawRow()], 100);

    await listAgingRows({ ...BASE, page: 2, pageSize: 15 });

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("OFFSET");
    expect(sql).toContain("ROWS FETCH NEXT");
  });

  it("OFFSET is (page-1)*pageSize bound as a parameter", async () => {
    queueRowRaw([rawRow()], 100);

    await listAgingRows({ ...BASE, page: 4, pageSize: 25 });

    const { values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(values).toContain(75); // skip = (4-1)*25
    expect(values).toContain(25); // pageSize
  });
});

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

describe("listAgingRows — sort", () => {
  it("defaults to dueDate ASC when no sortBy specified", async () => {
    queueRowRaw([rawRow()], 1);

    await listAgingRows(BASE);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("i.dueDate ASC");
  });

  it("sorts by balanceAmount when sortBy=balanceAmount", async () => {
    queueRowRaw([rawRow()], 1);

    await listAgingRows({ ...BASE, sortBy: "balanceAmount" });

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("CAST(i.balanceAmount AS FLOAT)");
  });

  it("sorts by daysOverdue when sortBy=daysOverdue", async () => {
    queueRowRaw([rawRow()], 1);

    await listAgingRows({ ...BASE, sortBy: "daysOverdue" });

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("DATEDIFF(day, i.dueDate, GETDATE())");
  });

  it("respects sortDir=desc", async () => {
    queueRowRaw([rawRow()], 1);

    await listAgingRows({ ...BASE, sortBy: "dueDate", sortDir: "desc" });

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("DESC");
  });
});

// ---------------------------------------------------------------------------
// Tenant isolation
// ---------------------------------------------------------------------------

describe("listAgingRows — tenant isolation", () => {
  it("organizationId is bound as a parameter, never interpolated", async () => {
    queueRowRaw([rawRow()], 1);

    await listAgingRows({ ...BASE, organizationId: "org-secure" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(values).toContain("org-secure");
    expect(sql).not.toContain("org-secure");
  });
});

// ---------------------------------------------------------------------------
// KPI — SQL aggregation
// ---------------------------------------------------------------------------

describe("getAgingKPIs — SQL aggregation", () => {
  function kpiRow(overrides: Partial<{
    totalOutstanding: number;
    currentTotal: number;
    currentCount: number;
    b1to30Total: number;
    b1to30Count: number;
    b31to60Total: number;
    b31to60Count: number;
    b61to90Total: number;
    b61to90Count: number;
    b90plusTotal: number;
    b90plusCount: number;
    invoiceCount: number;
  }> = {}) {
    return {
      totalOutstanding: 0,
      currentTotal: 0, currentCount: 0,
      b1to30Total: 0,  b1to30Count: 0,
      b31to60Total: 0, b31to60Count: 0,
      b61to90Total: 0, b61to90Count: 0,
      b90plusTotal: 0, b90plusCount: 0,
      invoiceCount: 0,
      ...overrides,
    };
  }

  it("uses a single $queryRaw call (no findMany)", async () => {
    mockQueryRaw.mockResolvedValueOnce([kpiRow()]);

    await getAgingKPIs(BASE);

    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
  });

  it("returns totalOutstanding from SQL SUM", async () => {
    mockQueryRaw.mockResolvedValueOnce([kpiRow({ totalOutstanding: 80000 })]);

    const { kpis } = await getAgingKPIs(BASE);

    expect(kpis.totalOutstanding).toBe(80000);
  });

  it("returns current bucket total from conditional SUM", async () => {
    mockQueryRaw.mockResolvedValueOnce([kpiRow({ currentTotal: 30000 })]);

    const { kpis } = await getAgingKPIs(BASE);

    expect(kpis.current).toBe(30000);
  });

  it("returns bucket1to30 from conditional SUM", async () => {
    mockQueryRaw.mockResolvedValueOnce([kpiRow({ b1to30Total: 15000 })]);

    const { kpis } = await getAgingKPIs(BASE);

    expect(kpis.bucket1to30).toBe(15000);
  });

  it("returns bucket31to60 from conditional SUM", async () => {
    mockQueryRaw.mockResolvedValueOnce([kpiRow({ b31to60Total: 10000 })]);

    const { kpis } = await getAgingKPIs(BASE);

    expect(kpis.bucket31to60).toBe(10000);
  });

  it("returns bucket61to90 from conditional SUM", async () => {
    mockQueryRaw.mockResolvedValueOnce([kpiRow({ b61to90Total: 8000 })]);

    const { kpis } = await getAgingKPIs(BASE);

    expect(kpis.bucket61to90).toBe(8000);
  });

  it("returns bucket90plus from conditional SUM", async () => {
    mockQueryRaw.mockResolvedValueOnce([kpiRow({ b90plusTotal: 5000 })]);

    const { kpis } = await getAgingKPIs(BASE);

    expect(kpis.bucket90plus).toBe(5000);
  });

  it("returns bucket counts in AgingBucketSummary array", async () => {
    mockQueryRaw.mockResolvedValueOnce([kpiRow({
      currentCount: 5,  currentTotal: 10000,
      b1to30Count:  3,  b1to30Total:  6000,
      b90plusCount: 2,  b90plusTotal: 4000,
    })]);

    const { buckets } = await getAgingKPIs(BASE);

    expect(buckets.find((b) => b.bucket === "current")?.count).toBe(5);
    expect(buckets.find((b) => b.bucket === "1-30")?.count).toBe(3);
    expect(buckets.find((b) => b.bucket === "90+")?.count).toBe(2);
    expect(buckets.find((b) => b.bucket === "current")?.totalAmount).toBe(10000);
  });

  it("bucket labels are set from AGING_BUCKET_LABELS", async () => {
    mockQueryRaw.mockResolvedValueOnce([kpiRow()]);

    const { buckets } = await getAgingKPIs(BASE);

    expect(buckets.find((b) => b.bucket === "current")?.label).toBe("Corrente / Não Vencido");
    expect(buckets.find((b) => b.bucket === "90+")?.label).toBe("Mais de 90 dias");
  });

  it("SQL includes conditional SUM for each bucket", async () => {
    mockQueryRaw.mockResolvedValueOnce([kpiRow()]);

    await getAgingKPIs(BASE);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("BETWEEN 1 AND 30");
    expect(sql).toContain("BETWEEN 31 AND 60");
    expect(sql).toContain("BETWEEN 61 AND 90");
    expect(sql).toContain("> 90");
  });

  it("organizationId is bound as a parameter in KPI query", async () => {
    mockQueryRaw.mockResolvedValueOnce([kpiRow()]);

    await getAgingKPIs({ ...BASE, organizationId: "org-kpi" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(values).toContain("org-kpi");
    expect(sql).not.toContain("org-kpi");
  });

  it("returns zeros when aggregation row is empty", async () => {
    mockQueryRaw.mockResolvedValueOnce([undefined]);

    const { kpis } = await getAgingKPIs(BASE);

    expect(kpis.totalOutstanding).toBe(0);
    expect(kpis.current).toBe(0);
    expect(kpis.bucket90plus).toBe(0);
  });
});
