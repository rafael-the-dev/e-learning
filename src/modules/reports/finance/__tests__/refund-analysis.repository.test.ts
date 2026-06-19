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

import * as refundAnalysisRepository from "../repositories/refund-analysis.repository";
import {
  getRefundAnalysisKPIs,
  getRefundTrend,
  getRefundAmountTrend,
  getRefundByBranch,
  getRefundByCourse,
  getRefundByStatus,
  getRefundProcessingTimeTrend,
  listRefundAnalysisRows,
  getRefundWatchlist,
  hasCriticalRefundIntegrityIssue,
  computeRefundWatchlistSeverity,
} from "../repositories/refund-analysis.repository";
import type { RefundAnalysisFilters } from "../types";

const BASE: RefundAnalysisFilters = { organizationId: "org-1", page: 1, pageSize: 20 };

beforeEach(() => {
  vi.clearAllMocks();
});

function coreRow(overrides: Partial<{
  totalRefunded: number; refundRequests: number; completedCount: number; largestRefund: number;
  pendingExposure: number; rejectedCount: number; averageProcessingDays: number | null;
}> = {}) {
  return {
    totalRefunded: 0,
    refundRequests: 0,
    completedCount: 0,
    largestRefund: 0,
    pendingExposure: 0,
    rejectedCount: 0,
    averageProcessingDays: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1, 2, 3, 4, 5, 6, 7 — KPI formulas
// ---------------------------------------------------------------------------

describe("getRefundAnalysisKPIs", () => {
  it("(test 1) totalRefunded sums COMPLETED refunds only — verified via the CASE WHEN in SQL", async () => {
    mockQueryRaw.mockResolvedValueOnce([coreRow({ totalRefunded: 1500 })]);
    mockQueryRaw.mockResolvedValueOnce([{ grossCollected: 10000 }]);

    const kpis = await getRefundAnalysisKPIs(BASE);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("SUM(CASE WHEN r.status = 'COMPLETED' THEN CAST(r.amount AS FLOAT) ELSE 0 END)");
    expect(kpis.totalRefunded).toBe(1500);
  });

  it("(test 2) pendingRefundExposure sums REQUESTED + APPROVED only", async () => {
    mockQueryRaw.mockResolvedValueOnce([coreRow({ pendingExposure: 7000 })]);
    mockQueryRaw.mockResolvedValueOnce([{ grossCollected: 10000 }]);

    const kpis = await getRefundAnalysisKPIs(BASE);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("r.status IN ('REQUESTED', 'APPROVED')");
    expect(kpis.pendingRefundExposure).toBe(7000);
  });

  it("(test 3) refundRate = completed refund amount / grossCollected * 100", async () => {
    mockQueryRaw.mockResolvedValueOnce([coreRow({ totalRefunded: 500 })]);
    mockQueryRaw.mockResolvedValueOnce([{ grossCollected: 2000 }]);

    const kpis = await getRefundAnalysisKPIs(BASE);
    expect(kpis.refundRate).toBe(25);
  });

  it("refundRate is 0 (no division by zero) when grossCollected is 0", async () => {
    mockQueryRaw.mockResolvedValueOnce([coreRow({ totalRefunded: 500 })]);
    mockQueryRaw.mockResolvedValueOnce([{ grossCollected: 0 }]);

    const kpis = await getRefundAnalysisKPIs(BASE);
    expect(kpis.refundRate).toBe(0);
  });

  it("(test 4) averageRefundAmount = totalRefunded / completedCount", async () => {
    mockQueryRaw.mockResolvedValueOnce([coreRow({ totalRefunded: 900, completedCount: 3 })]);
    mockQueryRaw.mockResolvedValueOnce([{ grossCollected: 10000 }]);

    const kpis = await getRefundAnalysisKPIs(BASE);
    expect(kpis.averageRefundAmount).toBe(300);
  });

  it("(test 5) largestRefund passes through MAX(amount) WHERE COMPLETED", async () => {
    mockQueryRaw.mockResolvedValueOnce([coreRow({ largestRefund: 42000 })]);
    mockQueryRaw.mockResolvedValueOnce([{ grossCollected: 10000 }]);

    const { sql } = flattenSql((await (async () => {
      const kpis = await getRefundAnalysisKPIs(BASE);
      return { kpis, call: mockQueryRaw.mock.calls[0][0] };
    })()).call);
    expect(sql).toContain("MAX(CASE WHEN r.status = 'COMPLETED' THEN CAST(r.amount AS FLOAT) END)");
  });

  it("(test 6) rejectedRefundRate = rejected count / total refund requests * 100", async () => {
    mockQueryRaw.mockResolvedValueOnce([coreRow({ refundRequests: 10, rejectedCount: 2 })]);
    mockQueryRaw.mockResolvedValueOnce([{ grossCollected: 10000 }]);

    const kpis = await getRefundAnalysisKPIs(BASE);
    expect(kpis.rejectedRefundRate).toBe(20);
  });

  it("(test 7) averageProcessingDays passes through AVG(DATEDIFF) WHERE COMPLETED", async () => {
    mockQueryRaw.mockResolvedValueOnce([coreRow({ averageProcessingDays: 4.5 })]);
    mockQueryRaw.mockResolvedValueOnce([{ grossCollected: 10000 }]);

    const kpis = await getRefundAnalysisKPIs(BASE);
    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("AVG(CASE WHEN r.status = 'COMPLETED' THEN CAST(DATEDIFF(day, r.createdAt, r.completedAt) AS FLOAT) END)");
    expect(kpis.averageProcessingDays).toBe(4.5);
  });

  it("(test 14) scopes both the core query and grossCollected to organizationId — tenant isolation", async () => {
    mockQueryRaw.mockResolvedValueOnce([coreRow()]);
    mockQueryRaw.mockResolvedValueOnce([{ grossCollected: 0 }]);
    await getRefundAnalysisKPIs(BASE);

    const core = flattenSql(mockQueryRaw.mock.calls[0][0]);
    const gross = flattenSql(mockQueryRaw.mock.calls[1][0]);
    expect(core.sql).toContain("r.organizationId = ?");
    expect(core.values).toContain("org-1");
    expect(gross.sql).toContain("i.organizationId = ?");
    expect(gross.values).toContain("org-1");
  });

  it("(test 13) applies createdAt date-range filters to the population", async () => {
    mockQueryRaw.mockResolvedValueOnce([coreRow()]);
    mockQueryRaw.mockResolvedValueOnce([{ grossCollected: 0 }]);
    await getRefundAnalysisKPIs({ ...BASE, dateFrom: "2026-01-01", dateTo: "2026-01-31" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("r.createdAt >= ?");
    expect(sql).toContain("r.createdAt <= ?");
    expect(values.some((v) => v instanceof Date)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8 — Trend grouped in SQL
// ---------------------------------------------------------------------------

describe("getRefundTrend", () => {
  it("(test 8) groups by createdAt month entirely in SQL, sliced by current status", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ month: "2026-01", requested: 1, approved: 2, completed: 3, rejected: 0 }]);
    const rows = await getRefundTrend(BASE);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("GROUP BY CONVERT(VARCHAR(7), r.createdAt, 120)");
    expect(sql).toContain("COUNT(CASE WHEN r.status = 'REQUESTED' THEN 1 END)");
    expect(rows).toEqual([{ month: "2026-01", requested: 1, approved: 2, completed: 3, rejected: 0 }]);
  });
});

describe("getRefundAmountTrend", () => {
  it("buckets refundedAmount by completedAt and pendingExposure by createdAt, merging months", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ month: "2026-02", refundedAmount: 500 }]);
    mockQueryRaw.mockResolvedValueOnce([{ month: "2026-01", pendingExposure: 300 }]);

    const rows = await getRefundAmountTrend(BASE);

    const refundedCall = flattenSql(mockQueryRaw.mock.calls[0][0]);
    const pendingCall = flattenSql(mockQueryRaw.mock.calls[1][0]);
    expect(refundedCall.sql).toContain("CONVERT(VARCHAR(7), r.completedAt, 120)");
    expect(refundedCall.sql).toContain("r.status = 'COMPLETED'");
    expect(pendingCall.sql).toContain("CONVERT(VARCHAR(7), r.createdAt, 120)");
    expect(pendingCall.sql).toContain("r.status IN ('REQUESTED', 'APPROVED')");

    expect(rows).toEqual([
      { month: "2026-01", refundedAmount: 0, pendingExposure: 300 },
      { month: "2026-02", refundedAmount: 500, pendingExposure: 0 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// 9 — Branch attribution fallback
// ---------------------------------------------------------------------------

describe("branch attribution fallback", () => {
  it("(test 9) getRefundByBranch resolves COALESCE(Refund.branchId, Payment.branchId, Invoice.branchId)", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ branchId: "branch-1", branchName: "Filial Central", totalAmount: 100 }]);
    const rows = await getRefundByBranch(BASE);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("COALESCE(r.branchId, p.branchId, i.branchId) AS branchId");
    expect(sql).toContain("GROUP BY COALESCE(r.branchId, p.branchId, i.branchId), b.name");
    expect(rows[0].branchName).toBe("Filial Central");
  });

  it("falls back to 'Sem Filial' when branch is unresolvable", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ branchId: null, branchName: null, totalAmount: 100 }]);
    const rows = await getRefundByBranch(BASE);
    expect(rows[0].branchName).toBe("Sem Filial");
  });

  it("applies the branchId filter against the same COALESCE expression in the WHERE clause", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    await getRefundByBranch({ ...BASE, branchId: "branch-9" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("COALESCE(r.branchId, p.branchId, i.branchId) = ?");
    expect(values).toContain("branch-9");
  });
});

// ---------------------------------------------------------------------------
// 10 — Course attribution
// ---------------------------------------------------------------------------

describe("course attribution", () => {
  it("(test 10) resolves course via COALESCE(Refund.enrollmentId, Payment.enrollmentId, Invoice.enrollmentId) -> Enrollment.courseId", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    await getRefundByCourse(BASE);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("COALESCE(r.enrollmentId, p.enrollmentId, i.enrollmentId)");
  });

  it("applies the courseId filter via Enrollment.courseId", async () => {
    mockQueryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: BigInt(0) }]);
    await listRefundAnalysisRows({ ...BASE, courseId: "course-7" });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("e.courseId = ?");
    expect(values).toContain("course-7");
  });

  it("falls back to 'Sem Curso' when course is unresolvable", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ courseId: null, courseName: null, totalAmount: 50 }]);
    const rows = await getRefundByCourse(BASE);
    expect(rows[0].courseName).toBe("Sem Curso");
  });
});

// ---------------------------------------------------------------------------
// 11, 12 — Watchlist severity + pending age calculations
// ---------------------------------------------------------------------------

describe("computeRefundWatchlistSeverity", () => {
  it("(test 11) returns null for REJECTED/COMPLETED — only REQUESTED/APPROVED can be risky", () => {
    expect(computeRefundWatchlistSeverity(999999, "REJECTED", 999)).toBeNull();
    expect(computeRefundWatchlistSeverity(999999, "COMPLETED", 999)).toBeNull();
  });

  it("CRITICAL when amount >= 50,000 MT regardless of status/age", () => {
    expect(computeRefundWatchlistSeverity(50000, "REQUESTED", 0)).toBe("CRITICAL");
    expect(computeRefundWatchlistSeverity(60000, "APPROVED", 0)).toBe("CRITICAL");
  });

  it("(test 12) CRITICAL when APPROVED for more than 30 days (approvedAt-based age)", () => {
    expect(computeRefundWatchlistSeverity(100, "APPROVED", 31)).toBe("CRITICAL");
    expect(computeRefundWatchlistSeverity(100, "APPROVED", 30)).not.toBe("CRITICAL"); // boundary: > not >=
  });

  it("(test 12) CRITICAL when REQUESTED (pending) for more than 60 days (createdAt-based age)", () => {
    expect(computeRefundWatchlistSeverity(100, "REQUESTED", 61)).toBe("CRITICAL");
    expect(computeRefundWatchlistSeverity(100, "REQUESTED", 60)).not.toBe("CRITICAL");
  });

  it("HIGH when amount >= 10,000 MT or pending > 30 days", () => {
    expect(computeRefundWatchlistSeverity(10000, "REQUESTED", 0)).toBe("HIGH");
    expect(computeRefundWatchlistSeverity(100, "REQUESTED", 31)).toBe("HIGH");
  });

  it("APPROVED refunds have no HIGH/MEDIUM age rule — only the CRITICAL 30-day threshold applies", () => {
    expect(computeRefundWatchlistSeverity(100, "APPROVED", 20)).toBeNull();
    expect(computeRefundWatchlistSeverity(100, "APPROVED", 29)).toBeNull();
  });

  it("MEDIUM when amount >= 5,000 MT or pending > 14 days", () => {
    expect(computeRefundWatchlistSeverity(5000, "REQUESTED", 0)).toBe("MEDIUM");
    expect(computeRefundWatchlistSeverity(100, "REQUESTED", 15)).toBe("MEDIUM");
  });

  it("returns null (no open-ended LOW tier) below every threshold", () => {
    expect(computeRefundWatchlistSeverity(100, "REQUESTED", 5)).toBeNull();
    expect(computeRefundWatchlistSeverity(100, "APPROVED", 5)).toBeNull();
  });
});

describe("getRefundWatchlist", () => {
  it("restricts to REQUESTED/APPROVED and admits exactly the rows the severity thresholds would not null out", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    await getRefundWatchlist(BASE);

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("r.status IN ('REQUESTED', 'APPROVED')");
    expect(sql).toContain("CAST(r.amount AS FLOAT) >= ?");
  });

  it("(test 18-style limit) caps the watchlist at TOP (20)", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    await getRefundWatchlist(BASE);

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("SELECT TOP (?)");
    expect(values).toContain(20);
  });

  it("maps recommendedAction by status: REQUESTED -> REVIEW_REQUEST, APPROVED -> COMPLETE_REFUND", async () => {
    mockQueryRaw.mockResolvedValueOnce([
      { id: "r1", refundNumber: "REF-1", status: "REQUESTED", amount: 6000, studentId: "s1", firstName: "Ana", lastName: "Silva", branchName: "Filial A", courseName: "Curso A", paymentId: "p1", ageDays: 20 },
      { id: "r2", refundNumber: "REF-2", status: "APPROVED", amount: 6000, studentId: "s2", firstName: "Bruno", lastName: "Costa", branchName: "Filial B", courseName: "Curso B", paymentId: "p2", ageDays: 5 },
    ]);
    const items = await getRefundWatchlist(BASE);

    expect(items.find((i) => i.refundId === "r1")?.recommendedAction).toBe("REVIEW_REQUEST");
    expect(items.find((i) => i.refundId === "r2")?.recommendedAction).toBe("COMPLETE_REFUND");
  });

  it("never links to a refund detail page — deep-links to the existing Refunds Report instead", async () => {
    mockQueryRaw.mockResolvedValueOnce([
      { id: "r1", refundNumber: "REF-1", status: "REQUESTED", amount: 6000, studentId: "s1", firstName: "Ana", lastName: null, branchName: "Filial A", courseName: "Curso A", paymentId: "p1", ageDays: 20 },
    ]);
    const items = await getRefundWatchlist(BASE);
    expect(items[0].link).toBe("/reports/finance/refunds?search=REF-1");
  });
});

// ---------------------------------------------------------------------------
// 13, 14 — date filters + tenant isolation across all functions
// ---------------------------------------------------------------------------

describe("tenant isolation", () => {
  it.each([
    ["getRefundTrend", () => getRefundTrend(BASE)],
    ["getRefundByStatus", () => getRefundByStatus(BASE)],
    ["getRefundProcessingTimeTrend", () => getRefundProcessingTimeTrend(BASE)],
    ["hasCriticalRefundIntegrityIssue", () => hasCriticalRefundIntegrityIssue("org-1")],
  ])("(test 14) %s scopes its query to organizationId", async (_name, fn) => {
    mockQueryRaw.mockResolvedValueOnce([{ count: 0 }]);
    await fn();
    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toMatch(/organizationId = \?/);
    expect(values).toContain("org-1");
  });
});

// ---------------------------------------------------------------------------
// 16 — Integrity warning
// ---------------------------------------------------------------------------

describe("hasCriticalRefundIntegrityIssue", () => {
  it("(test 16) checks across REFUND_TOTAL, PAYMENT_ALLOCATION, and LEDGER_CONSISTENCY", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ count: 1 }]);
    const result = await hasCriticalRefundIntegrityIssue("org-1");

    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("category IN ('REFUND_TOTAL', 'PAYMENT_ALLOCATION', 'LEDGER_CONSISTENCY')");
    expect(sql).toContain("severity = 'CRITICAL'");
    expect(sql).toContain("status = 'OPEN'");
    expect(result).toBe(true);
  });

  it("returns false when no critical issue is open", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ count: 0 }]);
    expect(await hasCriticalRefundIntegrityIssue("org-1")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 15 — Export respects filters (consistency across the functions export reuses)
// ---------------------------------------------------------------------------

describe("filter consistency across repository functions (what the export route reuses)", () => {
  it("(test 15) listRefundAnalysisRows and getRefundByBranch apply the same branch/status/minAmount filters", async () => {
    const filters: RefundAnalysisFilters = { ...BASE, branchId: "branch-5", status: "APPROVED", minAmount: 1000 };

    mockQueryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: BigInt(0) }]);
    await listRefundAnalysisRows(filters);
    const rowsWhere = flattenSql(mockQueryRaw.mock.calls[0][0]);

    mockQueryRaw.mockResolvedValueOnce([]);
    await getRefundByBranch(filters);
    const branchWhere = flattenSql(mockQueryRaw.mock.calls[2][0]);

    for (const fragment of ["COALESCE(r.branchId, p.branchId, i.branchId) = ?", "r.status = ?", "CAST(r.amount AS FLOAT) >= ?"]) {
      expect(rowsWhere.sql).toContain(fragment);
      expect(branchWhere.sql).toContain(fragment);
    }
  });
});

// ---------------------------------------------------------------------------
// 17 — No raw refund loading (pure SQL aggregation)
// ---------------------------------------------------------------------------

describe("no raw refund loading", () => {
  it("(test 17) every breakdown query aggregates in SQL (SUM/COUNT/AVG + GROUP BY), never a bare row dump", async () => {
    const checks: Array<[string, () => Promise<unknown>, string[]]> = [
      ["getRefundAnalysisKPIs", async () => { mockQueryRaw.mockResolvedValueOnce([coreRow()]).mockResolvedValueOnce([{ grossCollected: 0 }]); return getRefundAnalysisKPIs(BASE); }, ["SUM(", "COUNT(", "AVG("]],
      ["getRefundTrend", async () => { mockQueryRaw.mockResolvedValueOnce([]); return getRefundTrend(BASE); }, ["COUNT(", "GROUP BY"]],
      ["getRefundByStatus", async () => { mockQueryRaw.mockResolvedValueOnce([]); return getRefundByStatus(BASE); }, ["COUNT(*)", "GROUP BY"]],
      ["getRefundProcessingTimeTrend", async () => { mockQueryRaw.mockResolvedValueOnce([]); return getRefundProcessingTimeTrend(BASE); }, ["AVG(", "GROUP BY"]],
    ];

    for (const [, run, mustContain] of checks) {
      mockQueryRaw.mockClear();
      await run();
      const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
      for (const fragment of mustContain) expect(sql).toContain(fragment);
    }
  });

  it("listRefundAnalysisRows issues exactly 2 queries (page + count), never a third unscoped fetch", async () => {
    mockQueryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: BigInt(0) }]);
    await listRefundAnalysisRows(BASE);
    expect(mockQueryRaw).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// 18 — SQL pagination
// ---------------------------------------------------------------------------

describe("listRefundAnalysisRows pagination", () => {
  it("(test 18) paginates via OFFSET / FETCH NEXT with the correct skip and pageSize", async () => {
    mockQueryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: BigInt(0) }]);
    await listRefundAnalysisRows({ ...BASE, page: 3, pageSize: 10 });

    const { sql, values } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("OFFSET ? ROWS FETCH NEXT ? ROWS ONLY");
    expect(values).toContain(20); // (page 3 - 1) * pageSize 10
    expect(values).toContain(10);
  });
});

// ---------------------------------------------------------------------------
// 19 — SQL sorting
// ---------------------------------------------------------------------------

describe("listRefundAnalysisRows sorting", () => {
  it("(test 19) defaults to Amount DESC", async () => {
    mockQueryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: BigInt(0) }]);
    await listRefundAnalysisRows(BASE);
    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("ORDER BY CAST(r.amount AS FLOAT) DESC");
  });

  it("sorts by createdAt ascending when requested", async () => {
    mockQueryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: BigInt(0) }]);
    await listRefundAnalysisRows({ ...BASE, sortBy: "createdAt", sortDir: "asc" });
    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("ORDER BY r.createdAt ASC");
  });

  it("ignores an unknown sortBy and falls back to the default", async () => {
    mockQueryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: BigInt(0) }]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await listRefundAnalysisRows({ ...BASE, sortBy: "notAColumn" as any });
    const { sql } = flattenSql(mockQueryRaw.mock.calls[0][0]);
    expect(sql).toContain("ORDER BY CAST(r.amount AS FLOAT) DESC");
  });
});

// ---------------------------------------------------------------------------
// 20 — Refund reason chart only appears if reasons exist (never, in this schema)
// ---------------------------------------------------------------------------

describe("refund reasons", () => {
  it("(test 20) exposes no reason-grouping export — Refund.reason is unstructured free text, not a taxonomy (see types/index.ts comment); the spec's own 'skip chart if no reasons exist' rule applies permanently here", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((refundAnalysisRepository as any).getRefundsByReason).toBeUndefined();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((refundAnalysisRepository as any).getRefundByReason).toBeUndefined();
  });
});
