import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const mockQueryRaw = vi.fn();

vi.mock("@/server/db", () => ({
  getDb: async () => ({ $queryRaw: mockQueryRaw }),
}));

function flattenSql(sql: Prisma.Sql): { sql: string; values: unknown[] } {
  const values: unknown[] = [];
  function walk(s: Prisma.Sql): string {
    let result = "";
    for (let i = 0; i < s.strings.length; i++) {
      result += s.strings[i];
      if (i < s.values.length) {
        const val = s.values[i];
        if (val && typeof val === "object" && "strings" in val) {
          result += walk(val as Prisma.Sql);
        } else {
          values.push(val);
          result += "?";
        }
      }
    }
    return result;
  }
  return { sql: walk(sql), values };
}

import { getDb } from "@/server/db";
import {
  listWalletLiabilityRows,
  getWalletLiabilityKPIs,
  getNegativeBalanceWatchlist,
  getBalanceBandWatchlist,
  getDormancyBandWatchlist,
  hasCriticalWalletIntegrityIssue,
} from "../repositories/wallet-liability.repository";
import type { WalletLiabilityFilters } from "../types";

const BASE: WalletLiabilityFilters = { organizationId: "org-1", page: 1, pageSize: 20 };

beforeEach(() => {
  vi.clearAllMocks();
});

function rawAggRow(overrides: Partial<{
  walletId: string; studentId: string; firstName: string | null; lastName: string | null;
  studentCode: string | null; branchId: string | null; branchName: string | null;
  courseId: string | null; courseName: string | null; currentBalance: number;
  creditsIssued: number; creditsConsumed: number; transactionCount: number;
  lastTransactionDate: Date | null; daysDormant: number | null;
}> = {}) {
  return {
    walletId: "wallet-1",
    studentId: "student-1",
    firstName: "Maria",
    lastName: "Silva",
    studentCode: "STU-001",
    branchId: "branch-1",
    branchName: "Filial Central",
    courseId: "course-1",
    courseName: "Condução B",
    currentBalance: 1000,
    creditsIssued: 400,
    creditsConsumed: 100,
    transactionCount: 5,
    lastTransactionDate: new Date("2026-05-01"),
    daysDormant: 10,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1 & 2. Total liability sums only positive balances / excludes negative
// ---------------------------------------------------------------------------

describe("getWalletLiabilityKPIs — totalLiability (tests 1 & 2)", () => {
  it("sums only positive balances and excludes negative ones from the liability total", async () => {
    mockQueryRaw.mockResolvedValueOnce([{
      totalLiability: 5000, studentsWithCredit: 3, largestBalance: 2500,
      creditsIssuedThisPeriod: 1200, creditsConsumedThisPeriod: 300, dormantWallets: 1,
    }]);

    const kpis = await getWalletLiabilityKPIs(BASE);

    expect(kpis.totalLiability).toBe(5000);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("WHEN currentBalance > 0 THEN currentBalance ELSE 0 END");
    expect(sql).not.toContain("currentBalance < 0");
  });
});

// ---------------------------------------------------------------------------
// 3. Students with credit count correct
// ---------------------------------------------------------------------------

describe("getWalletLiabilityKPIs — studentsWithCredit (test 3)", () => {
  it("counts only wallets with a positive balance", async () => {
    mockQueryRaw.mockResolvedValueOnce([{
      totalLiability: 5000, studentsWithCredit: 3, largestBalance: 2500,
      creditsIssuedThisPeriod: 1200, creditsConsumedThisPeriod: 300, dormantWallets: 1,
    }]);

    const kpis = await getWalletLiabilityKPIs(BASE);

    expect(kpis.studentsWithCredit).toBe(3);
    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("COUNT(CASE WHEN currentBalance > 0 THEN 1 END)");
  });
});

// ---------------------------------------------------------------------------
// 4. Average positive balance correct
// ---------------------------------------------------------------------------

describe("getWalletLiabilityKPIs — averagePositiveBalance (test 4)", () => {
  it("divides totalLiability by studentsWithCredit", async () => {
    mockQueryRaw.mockResolvedValueOnce([{
      totalLiability: 5000, studentsWithCredit: 5, largestBalance: 2500,
      creditsIssuedThisPeriod: 0, creditsConsumedThisPeriod: 0, dormantWallets: 0,
    }]);

    const kpis = await getWalletLiabilityKPIs(BASE);
    expect(kpis.averagePositiveBalance).toBe(1000);
  });

  it("guards against division by zero when no students have credit", async () => {
    mockQueryRaw.mockResolvedValueOnce([{
      totalLiability: 0, studentsWithCredit: 0, largestBalance: 0,
      creditsIssuedThisPeriod: 0, creditsConsumedThisPeriod: 0, dormantWallets: 0,
    }]);

    const kpis = await getWalletLiabilityKPIs(BASE);
    expect(kpis.averagePositiveBalance).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Largest wallet balance correct
// ---------------------------------------------------------------------------

describe("getWalletLiabilityKPIs — largestBalance (test 5)", () => {
  it("takes MAX(currentBalance) over positive wallets only", async () => {
    mockQueryRaw.mockResolvedValueOnce([{
      totalLiability: 5000, studentsWithCredit: 3, largestBalance: 2500,
      creditsIssuedThisPeriod: 0, creditsConsumedThisPeriod: 0, dormantWallets: 0,
    }]);

    const kpis = await getWalletLiabilityKPIs(BASE);
    expect(kpis.largestBalance).toBe(2500);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("MAX(CASE WHEN currentBalance > 0 THEN currentBalance END)");
  });
});

// ---------------------------------------------------------------------------
// 6 & 7. Credits issued / consumed period calculation correct
// ---------------------------------------------------------------------------

describe("getWalletLiabilityKPIs — credits issued/consumed this period (tests 6 & 7)", () => {
  it("sums per-wallet period-scoped credits issued and consumed", async () => {
    mockQueryRaw.mockResolvedValueOnce([{
      totalLiability: 5000, studentsWithCredit: 3, largestBalance: 2500,
      creditsIssuedThisPeriod: 1200, creditsConsumedThisPeriod: 300, dormantWallets: 0,
    }]);

    const kpis = await getWalletLiabilityKPIs({ ...BASE, dateFrom: "2026-05-01", dateTo: "2026-05-31" });

    expect(kpis.creditsIssuedThisPeriod).toBe(1200);
    expect(kpis.creditsConsumedThisPeriod).toBe(300);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("t.createdAt >=");
    expect(sql).toContain("t.createdAt <=");
    expect(sql).toContain("CAST(t.amount AS FLOAT) > 0");
    expect(sql).toContain("ABS(ISNULL(SUM(CASE WHEN");
  });
});

// ---------------------------------------------------------------------------
// 8. Net movement correct
// ---------------------------------------------------------------------------

describe("getWalletLiabilityKPIs — netWalletMovement (test 8)", () => {
  it("computes creditsIssued - creditsConsumed", async () => {
    mockQueryRaw.mockResolvedValueOnce([{
      totalLiability: 5000, studentsWithCredit: 3, largestBalance: 2500,
      creditsIssuedThisPeriod: 1200, creditsConsumedThisPeriod: 300, dormantWallets: 0,
    }]);

    const kpis = await getWalletLiabilityKPIs(BASE);
    expect(kpis.netWalletMovement).toBe(900);
  });
});

// ---------------------------------------------------------------------------
// 9. Dormant wallets count correct
// ---------------------------------------------------------------------------

describe("getWalletLiabilityKPIs — dormantWallets (test 9)", () => {
  it("counts positive-balance wallets dormant for at least 90 days", async () => {
    mockQueryRaw.mockResolvedValueOnce([{
      totalLiability: 5000, studentsWithCredit: 3, largestBalance: 2500,
      creditsIssuedThisPeriod: 0, creditsConsumedThisPeriod: 0, dormantWallets: 2,
    }]);

    const kpis = await getWalletLiabilityKPIs(BASE);
    expect(kpis.dormantWallets).toBe(2);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("currentBalance > 0 AND daysDormant >=");
  });
});

// ---------------------------------------------------------------------------
// 10. Watchlist includes negative balances
// ---------------------------------------------------------------------------

describe("getNegativeBalanceWatchlist — includes negative balances (test 10)", () => {
  it("flags negative-balance wallets as CRITICAL", async () => {
    mockQueryRaw.mockResolvedValueOnce([rawAggRow({ currentBalance: -250 })]);
    const db = await getDb();

    const items = await getNegativeBalanceWatchlist(db, BASE);

    expect(items).toHaveLength(1);
    expect(items[0].severity).toBe("CRITICAL");
    expect(items[0].currentBalance).toBe(-250);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("< 0");
  });
});

// ---------------------------------------------------------------------------
// 11. Watchlist includes large balances
// ---------------------------------------------------------------------------

describe("getBalanceBandWatchlist — includes large balances (test 11)", () => {
  it("flags balances >= 50000 as HIGH and >= 10000 as MEDIUM", async () => {
    mockQueryRaw.mockResolvedValueOnce([
      rawAggRow({ studentId: "student-high", currentBalance: 60000 }),
      rawAggRow({ studentId: "student-medium", currentBalance: 15000 }),
    ]);
    const db = await getDb();

    const items = await getBalanceBandWatchlist(db, BASE);

    expect(items.find((i) => i.studentId === "student-high")?.severity).toBe("HIGH");
    expect(items.find((i) => i.studentId === "student-medium")?.severity).toBe("MEDIUM");

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain(">= ?");
  });
});

// ---------------------------------------------------------------------------
// 12. Watchlist includes dormant balances
// ---------------------------------------------------------------------------

describe("getDormancyBandWatchlist — includes dormant balances (test 12)", () => {
  it("flags dormancy >= 180 days as HIGH and >= 90 days as MEDIUM", async () => {
    mockQueryRaw.mockResolvedValueOnce([
      rawAggRow({ studentId: "student-very-dormant", daysDormant: 200, currentBalance: 500 }),
      rawAggRow({ studentId: "student-dormant", daysDormant: 95, currentBalance: 500 }),
    ]);
    const db = await getDb();

    const items = await getDormancyBandWatchlist(db, BASE);

    expect(items.find((i) => i.studentId === "student-very-dormant")?.severity).toBe("HIGH");
    expect(items.find((i) => i.studentId === "student-dormant")?.severity).toBe("MEDIUM");

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("DATEDIFF(day, MAX(t.createdAt), GETDATE()) >=");
  });
});

// ---------------------------------------------------------------------------
// 13. Branch attribution works
// ---------------------------------------------------------------------------

describe("branch attribution (test 13)", () => {
  it("filters by Student.branchId and falls back to 'Sem Filial' when null", async () => {
    mockQueryRaw.mockResolvedValueOnce([rawAggRow({ branchId: null, branchName: null })]);
    mockQueryRaw.mockResolvedValueOnce([{ total: BigInt(1) }]);

    const { rows } = await listWalletLiabilityRows({ ...BASE, branchId: "branch-9" });

    expect(rows[0].branchName).toBe("Sem Filial");

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("s.branchId =");
    expect(values).toContain("branch-9");
  });
});

// ---------------------------------------------------------------------------
// 14. Course attribution works
// ---------------------------------------------------------------------------

describe("course attribution (test 14)", () => {
  it("resolves the most recent ACTIVE enrollment's course and falls back to 'Sem Curso'", async () => {
    mockQueryRaw.mockResolvedValueOnce([rawAggRow({ courseId: null, courseName: null })]);
    mockQueryRaw.mockResolvedValueOnce([{ total: BigInt(1) }]);

    const { rows } = await listWalletLiabilityRows({ ...BASE, courseId: "course-9" });

    expect(rows[0].courseName).toBe("Sem Curso");

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("status = 'ACTIVE'");
    expect(sql).toContain("ROW_NUMBER()");
    expect(sql).toContain("ae.courseId =");
    expect(values).toContain("course-9");
  });
});

// ---------------------------------------------------------------------------
// 15. Minimum balance filter uses HAVING
// ---------------------------------------------------------------------------

describe("minimum balance filter uses HAVING (test 15)", () => {
  it("applies minBalance as a HAVING predicate, after GROUP BY", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    mockQueryRaw.mockResolvedValueOnce([{ total: BigInt(0) }]);

    await listWalletLiabilityRows({ ...BASE, minBalance: 500 });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    const groupByIdx = sql.indexOf("GROUP BY");
    const havingIdx = sql.indexOf("HAVING");
    expect(groupByIdx).toBeGreaterThan(-1);
    expect(havingIdx).toBeGreaterThan(groupByIdx);
    expect(values).toContain(500);
  });
});

// ---------------------------------------------------------------------------
// 16. Pagination happens in SQL
// ---------------------------------------------------------------------------

describe("pagination happens in SQL (test 16)", () => {
  it("uses OFFSET / FETCH NEXT with (page-1)*pageSize bound as a parameter", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    mockQueryRaw.mockResolvedValueOnce([{ total: BigInt(0) }]);

    await listWalletLiabilityRows({ organizationId: "org-1", page: 3, pageSize: 10 });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("OFFSET");
    expect(sql).toContain("ROWS FETCH NEXT");
    expect(values).toContain(20);
    expect(values).toContain(10);
  });
});

// ---------------------------------------------------------------------------
// 17. Sorting happens in SQL
// ---------------------------------------------------------------------------

describe("sorting happens in SQL (test 17)", () => {
  it("orders by the requested column and direction", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    mockQueryRaw.mockResolvedValueOnce([{ total: BigInt(0) }]);

    await listWalletLiabilityRows({ ...BASE, sortBy: "creditsIssued", sortDir: "asc" });

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("ORDER BY creditsIssued ASC");
  });

  it("defaults to Current Balance DESC", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    mockQueryRaw.mockResolvedValueOnce([{ total: BigInt(0) }]);

    await listWalletLiabilityRows(BASE);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("ORDER BY currentBalance DESC");
  });
});

// ---------------------------------------------------------------------------
// 18. No raw transaction loading
// ---------------------------------------------------------------------------

describe("no raw transaction loading (test 18)", () => {
  it("listWalletLiabilityRows issues exactly two aggregated queries (rows + count)", async () => {
    mockQueryRaw.mockResolvedValueOnce([rawAggRow()]);
    mockQueryRaw.mockResolvedValueOnce([{ total: BigInt(1) }]);

    const { rows } = await listWalletLiabilityRows(BASE);

    expect(mockQueryRaw).toHaveBeenCalledTimes(2);
    expect(rows).toHaveLength(1);
    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("GROUP BY w.id");
  });

  it("getWalletLiabilityKPIs issues a single aggregate-of-aggregate query, never per-transaction rows", async () => {
    mockQueryRaw.mockResolvedValueOnce([{
      totalLiability: 0, studentsWithCredit: 0, largestBalance: 0,
      creditsIssuedThisPeriod: 0, creditsConsumedThisPeriod: 0, dormantWallets: 0,
    }]);

    await getWalletLiabilityKPIs(BASE);
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 19. Export respects filters (same code path the export route calls)
// ---------------------------------------------------------------------------

describe("export respects filters (test 19)", () => {
  it("applies branch, course, student, date range and minBalance together", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    mockQueryRaw.mockResolvedValueOnce([{ total: BigInt(0) }]);

    await listWalletLiabilityRows({
      organizationId: "org-1",
      branchId: "branch-1",
      courseId: "course-1",
      studentId: "student-1",
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
      minBalance: 100,
      page: 1,
      pageSize: 500,
    });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("s.branchId =");
    expect(sql).toContain("ae.courseId =");
    expect(sql).toContain("w.studentId =");
    expect(values).toEqual(
      expect.arrayContaining(["branch-1", "course-1", "student-1", 100])
    );
  });
});

// ---------------------------------------------------------------------------
// 20. Tenant isolation enforced
// ---------------------------------------------------------------------------

describe("tenant isolation (test 20)", () => {
  it("binds organizationId as a parameter, never interpolated", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    mockQueryRaw.mockResolvedValueOnce([{ total: BigInt(0) }]);

    await listWalletLiabilityRows({ organizationId: "org-secret", page: 1, pageSize: 20 });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).not.toContain("org-secret");
    expect(values).toContain("org-secret");
  });
});

// ---------------------------------------------------------------------------
// 21. Integrity warning appears for wallet critical issues
// ---------------------------------------------------------------------------

describe("hasCriticalWalletIntegrityIssue (test 21)", () => {
  it("returns true when an OPEN CRITICAL wallet-category issue exists", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ cnt: 1 }]);

    const result = await hasCriticalWalletIntegrityIssue("org-1");

    expect(result).toBe(true);
    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("severity = 'CRITICAL'");
    expect(sql).toContain("category = 'WALLET_BALANCE'");
  });

  it("returns false when no such issue exists", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ cnt: 0 }]);
    const result = await hasCriticalWalletIntegrityIssue("org-1");
    expect(result).toBe(false);
  });
});
