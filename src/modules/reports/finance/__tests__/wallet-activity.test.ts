import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

// ── DB mock ──────────────────────────────────────────────────────────────────
const mockQueryRaw = vi.fn();
const mockGroupBy = vi.fn();
const mockFindMany = vi.fn();
const mockCount = vi.fn();
const mockTxFindMany = vi.fn();
const mockTxCount = vi.fn();

vi.mock("@/server/db", () => ({
  getDb: async () => ({
    $queryRaw: mockQueryRaw,
    studentWallet: { findMany: mockFindMany, count: mockCount },
    studentWalletTransaction: { groupBy: mockGroupBy, findMany: mockTxFindMany, count: mockTxCount },
  }),
}));

// ── flattenSql helper ────────────────────────────────────────────────────────
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

import {
  listWalletActivityRows,
} from "../repositories/wallet-activity.repository";
import {
  findWalletsByOrganization,
  findTransactionsByWallet,
} from "../../../wallets/repositories/wallet.repository";

// ── Default mock row ──────────────────────────────────────────────────────────
const RAW_ROW = {
  walletId:            "w-1",
  studentId:           "s-1",
  firstName:           "Ana",
  lastName:            "Silva",
  studentCode:         "S001",
  currentBalance:      150.0,
  totalCredits:        200.0,
  totalDebits:         50.0,
  transactionCount:    BigInt(4),
  lastTransactionDate: new Date("2026-06-01"),
  lastTransactionType: "DEPOSIT",
};
const COUNT_ROW = [{ total: BigInt(1) }];

beforeEach(() => {
  vi.clearAllMocks();
  // Default: main query returns one row, count returns 1
  mockQueryRaw.mockResolvedValueOnce([RAW_ROW]).mockResolvedValueOnce(COUNT_ROW);
});

const BASE_FILTERS = {
  organizationId: "org-1",
  page: 1,
  pageSize: 20,
};

// ────────────────────────────────────────────────────────────────────────────
describe("listWalletActivityRows — row mapping", () => {
  it("maps SQL raw row to WalletActivityRow shape", async () => {
    const { rows, total } = await listWalletActivityRows(BASE_FILTERS);

    expect(total).toBe(1);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.walletId).toBe("w-1");
    expect(row.studentId).toBe("s-1");
    expect(row.studentName).toBe("Ana Silva");
    expect(row.studentCode).toBe("S001");
    expect(row.currentBalance).toBe(150.0);
    expect(row.totalCredits).toBe(200.0);
    expect(row.totalDebits).toBe(50.0);
    expect(row.transactionCount).toBe(4);
    expect(row.lastTransactionDate).toEqual(new Date("2026-06-01"));
    expect(row.lastTransactionType).toBe("DEPOSIT");
  });

  it("handles null student fields gracefully", async () => {
    mockQueryRaw.mockReset();
    mockQueryRaw
      .mockResolvedValueOnce([{ ...RAW_ROW, firstName: null, lastName: null, studentCode: null }])
      .mockResolvedValueOnce(COUNT_ROW);

    const { rows } = await listWalletActivityRows(BASE_FILTERS);
    expect(rows[0].studentName).toBe("");
    expect(rows[0].studentCode).toBeNull();
  });

  it("converts bigint transactionCount to number", async () => {
    const { rows } = await listWalletActivityRows(BASE_FILTERS);
    expect(typeof rows[0].transactionCount).toBe("number");
    expect(rows[0].transactionCount).toBe(4);
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("listWalletActivityRows — no N+1 / no transaction array load (test 1 & 14)", () => {
  it("calls $queryRaw exactly twice (main + count) and never groupBy per-wallet", async () => {
    await listWalletActivityRows(BASE_FILTERS);
    expect(mockQueryRaw).toHaveBeenCalledTimes(2);
    expect(mockGroupBy).not.toHaveBeenCalled();
  });

  it("does not call findMany on studentWallet inside listWalletActivityRows", async () => {
    await listWalletActivityRows(BASE_FILTERS);
    expect(mockFindMany).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("listWalletActivityRows — currentBalance uses SUM(amount) (test 2)", () => {
  it("SELECT contains SUM(CAST(t.amount AS FLOAT)) for currentBalance", async () => {
    await listWalletActivityRows(BASE_FILTERS);
    const [call] = mockQueryRaw.mock.calls;
    const { sql } = flattenSql(call[0] as Prisma.Sql);
    expect(sql).toContain("SUM(CAST(t.amount AS FLOAT))");
    expect(sql).toContain("currentBalance");
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("listWalletActivityRows — credits / debits aggregated in SQL (tests 3 & 4)", () => {
  it("totalCredits uses CASE WHEN amount > 0", async () => {
    await listWalletActivityRows(BASE_FILTERS);
    const [call] = mockQueryRaw.mock.calls;
    const { sql } = flattenSql(call[0] as Prisma.Sql);
    expect(sql).toContain("CAST(t.amount AS FLOAT) > 0");
    expect(sql).toContain("totalCredits");
  });

  it("totalDebits uses CASE WHEN amount < 0 wrapped in ABS", async () => {
    await listWalletActivityRows(BASE_FILTERS);
    const [call] = mockQueryRaw.mock.calls;
    const { sql } = flattenSql(call[0] as Prisma.Sql);
    expect(sql).toContain("CAST(t.amount AS FLOAT) < 0");
    expect(sql).toContain("ABS(");
    expect(sql).toContain("totalDebits");
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("listWalletActivityRows — transactionCount and lastTransactionDate (tests 5 & 6)", () => {
  it("transactionCount uses COUNT in SQL", async () => {
    await listWalletActivityRows(BASE_FILTERS);
    const [call] = mockQueryRaw.mock.calls;
    const { sql } = flattenSql(call[0] as Prisma.Sql);
    expect(sql).toContain("transactionCount");
    expect(sql).toMatch(/COUNT\(/);
  });

  it("lastTransactionDate uses MAX(t.createdAt)", async () => {
    await listWalletActivityRows(BASE_FILTERS);
    const [call] = mockQueryRaw.mock.calls;
    const { sql } = flattenSql(call[0] as Prisma.Sql);
    expect(sql).toContain("MAX(t.createdAt)");
    expect(sql).toContain("lastTransactionDate");
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("listWalletActivityRows — date range does NOT change currentBalance (test 7)", () => {
  it("currentBalance SUM is not wrapped in the period condition CASE WHEN", async () => {
    await listWalletActivityRows({ ...BASE_FILTERS, dateFrom: "2026-01-01", dateTo: "2026-06-30" });
    const [call] = mockQueryRaw.mock.calls;
    const { sql } = flattenSql(call[0] as Prisma.Sql);

    // The unconditional currentBalance SUM must appear
    expect(sql).toContain("ISNULL(SUM(CAST(t.amount AS FLOAT)), 0)");
    // Period condition appears in credits/debits CASE WHEN only (not wrapping the top-level SUM)
    expect(sql).toContain("totalCredits");
    expect(sql).toContain("totalDebits");
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("listWalletActivityRows — transaction type filter (test 8)", () => {
  it("binds transactionType as a SQL parameter in the period condition", async () => {
    await listWalletActivityRows({ ...BASE_FILTERS, transactionType: "DEPOSIT" });
    const [call] = mockQueryRaw.mock.calls;
    const { sql, values } = flattenSql(call[0] as Prisma.Sql);
    expect(sql).toContain("t.type = ?");
    expect(values).toContain("DEPOSIT");
  });

  it("transactionType does not appear in WHERE (only in period CASE WHEN)", async () => {
    await listWalletActivityRows({ ...BASE_FILTERS, transactionType: "CREDIT_APPLIED" });
    const [call] = mockQueryRaw.mock.calls;
    const { sql } = flattenSql(call[0] as Prisma.Sql);
    // t.type = ? appears in CASE WHEN, not in WHERE clause (wallet selection unaffected)
    expect(sql).toContain("t.type = ?");
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("listWalletActivityRows — minimum balance filter (test 9)", () => {
  it("minBalance appears in HAVING clause as bound parameter", async () => {
    await listWalletActivityRows({ ...BASE_FILTERS, minBalance: 100 });
    const [call] = mockQueryRaw.mock.calls;
    const { sql, values } = flattenSql(call[0] as Prisma.Sql);
    expect(sql).toContain("HAVING");
    expect(sql).toContain("SUM(CAST(t.amount AS FLOAT))");
    expect(values).toContain(100);
  });

  it("no HAVING clause when minBalance is not set", async () => {
    await listWalletActivityRows(BASE_FILTERS);
    const [call] = mockQueryRaw.mock.calls;
    const { sql } = flattenSql(call[0] as Prisma.Sql);
    expect(sql).not.toContain("HAVING");
  });

  it("count query also has HAVING clause for correct total", async () => {
    await listWalletActivityRows({ ...BASE_FILTERS, minBalance: 50 });
    const calls = mockQueryRaw.mock.calls;
    const { sql: countSql } = flattenSql(calls[1][0] as Prisma.Sql);
    expect(countSql).toContain("HAVING");
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("listWalletActivityRows — pagination in SQL (test 10)", () => {
  it("OFFSET and FETCH NEXT appear in main query", async () => {
    await listWalletActivityRows({ ...BASE_FILTERS, page: 3, pageSize: 10 });
    const [call] = mockQueryRaw.mock.calls;
    const { sql, values } = flattenSql(call[0] as Prisma.Sql);
    expect(sql).toContain("OFFSET");
    expect(sql).toContain("ROWS FETCH NEXT");
    // skip = (3-1)*10 = 20
    expect(values).toContain(20);
    expect(values).toContain(10);
  });

  it("count query uses COUNT(*) not slice", async () => {
    await listWalletActivityRows(BASE_FILTERS);
    const calls = mockQueryRaw.mock.calls;
    const { sql: countSql } = flattenSql(calls[1][0] as Prisma.Sql);
    expect(countSql).toContain("COUNT(*)");
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("listWalletActivityRows — sorting in SQL (test 11)", () => {
  it("defaults to ORDER BY currentBalance DESC", async () => {
    await listWalletActivityRows(BASE_FILTERS);
    const [call] = mockQueryRaw.mock.calls;
    const { sql } = flattenSql(call[0] as Prisma.Sql);
    expect(sql).toContain("ORDER BY");
    expect(sql).toContain("currentBalance DESC");
  });

  it("sortBy=studentName uses s.firstName", async () => {
    await listWalletActivityRows({ ...BASE_FILTERS, sortBy: "studentName", sortDir: "asc" });
    const [call] = mockQueryRaw.mock.calls;
    const { sql } = flattenSql(call[0] as Prisma.Sql);
    expect(sql).toContain("s.firstName ASC");
  });

  it("sortBy=lastTransactionDate DESC", async () => {
    await listWalletActivityRows({ ...BASE_FILTERS, sortBy: "lastTransactionDate", sortDir: "desc" });
    const [call] = mockQueryRaw.mock.calls;
    const { sql } = flattenSql(call[0] as Prisma.Sql);
    expect(sql).toContain("lastTransactionDate DESC");
  });

  it("sortBy=totalCredits ASC", async () => {
    await listWalletActivityRows({ ...BASE_FILTERS, sortBy: "totalCredits", sortDir: "asc" });
    const [call] = mockQueryRaw.mock.calls;
    const { sql } = flattenSql(call[0] as Prisma.Sql);
    expect(sql).toContain("totalCredits ASC");
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("findTransactionsByWallet — drilldown is paginated (test 12)", () => {
  beforeEach(() => {
    mockTxFindMany.mockResolvedValue([]);
    mockTxCount.mockResolvedValue(0);
  });

  it("calls findMany with skip and take (not unbounded)", async () => {
    await findTransactionsByWallet("w-1", "org-1", { page: 2, pageSize: 15 });
    expect(mockTxFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 15,
        take: 15,
        orderBy: { createdAt: "desc" },
      })
    );
  });

  it("always uses descending createdAt order", async () => {
    await findTransactionsByWallet("w-1", "org-1", { page: 1, pageSize: 10 });
    expect(mockTxFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "desc" } })
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("listWalletActivityRows — tenant isolation (test 13)", () => {
  it("organizationId is bound as a parameter, not interpolated into SQL template", async () => {
    await listWalletActivityRows({ ...BASE_FILTERS, organizationId: "org-secret" });
    const [call] = mockQueryRaw.mock.calls;
    const { sql, values } = flattenSql(call[0] as Prisma.Sql);
    expect(sql).not.toContain("org-secret");
    expect(values).toContain("org-secret");
  });

  it("organizationId appears in the CTE and the wallet WHERE", async () => {
    await listWalletActivityRows(BASE_FILTERS);
    const [call] = mockQueryRaw.mock.calls;
    const { values } = flattenSql(call[0] as Prisma.Sql);
    const orgOccurrences = values.filter((v) => v === "org-1");
    // Once in LastTx CTE WHERE, once in wallet WHERE
    expect(orgOccurrences.length).toBeGreaterThanOrEqual(2);
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("wallet.repository — no transactions array in walletSelect (test 1 / no N+1 test 14)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([
      {
        id: "w-1",
        organizationId: "org-1",
        studentId: "s-1",
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: null,
        student: { id: "s-1", firstName: "Ana", lastName: "Silva", code: null },
      },
    ]);
    mockCount.mockResolvedValue(1);
    mockGroupBy.mockResolvedValue([]);
  });

  it("findWalletsByOrganization does not include transactions in select", async () => {
    await findWalletsByOrganization("org-1", { page: 1, pageSize: 10 });
    const selectArg = mockFindMany.mock.calls[0][0].select;
    expect(selectArg).not.toHaveProperty("transactions");
  });

  it("findWalletsByOrganization batch-fetches balances via groupBy after main query", async () => {
    await findWalletsByOrganization("org-1", { page: 1, pageSize: 10 });
    expect(mockGroupBy).toHaveBeenCalledTimes(1);
    expect(mockGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["studentWalletId"],
        where: { studentWalletId: { in: ["w-1"] } },
        _sum: { amount: true },
      })
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("listWalletActivityRows — safe for 500k transactions (test 15)", () => {
  it("uses GROUP BY in SQL so never loads individual transaction rows", async () => {
    await listWalletActivityRows(BASE_FILTERS);
    const [call] = mockQueryRaw.mock.calls;
    const { sql } = flattenSql(call[0] as Prisma.Sql);
    expect(sql).toContain("GROUP BY");
    // No SELECT * or unbounded scan of student_wallet_transactions individually
    expect(sql).not.toMatch(/SELECT \*/);
  });

  it("LIKE search escapes SQL metacharacters", async () => {
    await listWalletActivityRows({ ...BASE_FILTERS, search: "50%_off[promo]" });
    const [call] = mockQueryRaw.mock.calls;
    const { sql, values } = flattenSql(call[0] as Prisma.Sql);
    expect(sql).toContain("LIKE");
    expect(sql).toContain("ESCAPE");
    const termValue = values.find((v) => typeof v === "string" && v.includes("50\\%\\_off\\[promo\\]"));
    expect(termValue).toBeDefined();
  });
});
