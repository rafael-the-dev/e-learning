import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { Prisma } from "@prisma/client";

const {
  deliveryGroupBy,
  deliveryAggregate,
  deliveryCount,
  deliveryFindMany,
  notificationGroupBy,
  queryRaw,
} = vi.hoisted(() => ({
  deliveryGroupBy: vi.fn(),
  deliveryAggregate: vi.fn(),
  deliveryCount: vi.fn(),
  deliveryFindMany: vi.fn(),
  notificationGroupBy: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  getDb: vi.fn().mockResolvedValue({
    $queryRaw: queryRaw,
    notificationDelivery: {
      groupBy: deliveryGroupBy,
      aggregate: deliveryAggregate,
      count: deliveryCount,
      findMany: deliveryFindMany,
    },
    notification: { groupBy: notificationGroupBy },
  }),
}));

import {
  getStatusCountsInRange,
  getAverageAttempts,
  getRetryBacklogCount,
  getTerminalFailureCount,
  getStaleRetryableFailureCount,
  getStuckProcessingCount,
  getEmailFailureCountByExactReason,
  getEmailFailureCountByKeywords,
  getRecentEmailFailureCount,
  getDailyVolume,
  getStatusDistribution,
  getChannelHealth,
  getFailureReasons,
  getTopEvents,
  getProblemDeliveries,
} from "../notification-operations.repository";

const ORG_ID = "org-1";
const OTHER_ORG_ID = "org-2";

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

beforeEach(() => vi.clearAllMocks());

describe("getStatusCountsInRange", () => {
  it("groups by status within the date range, scoped by organizationId (test 10)", async () => {
    (deliveryGroupBy as Mock).mockResolvedValue([
      { status: "SENT", _count: { _all: 3 } },
      { status: "FAILED", _count: { _all: 2 } },
    ]);
    const dateFrom = new Date("2026-06-01");
    const dateTo = new Date("2026-06-30");

    const result = await getStatusCountsInRange(ORG_ID, dateFrom, dateTo);

    expect(deliveryGroupBy).toHaveBeenCalledWith({
      by: ["status"],
      where: { organizationId: ORG_ID, createdAt: { gte: dateFrom, lte: dateTo } },
      _count: { _all: true },
    });
    expect(result).toEqual({ SENT: 3, FAILED: 2 });
  });
});

describe("getAverageAttempts", () => {
  it("uses Prisma _avg aggregate, scoped by organizationId and date range", async () => {
    (deliveryAggregate as Mock).mockResolvedValue({ _avg: { attempts: 1.5 } });
    const result = await getAverageAttempts(ORG_ID, new Date("2026-06-01"), new Date("2026-06-30"));
    expect(result).toBe(1.5);
    expect(deliveryAggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG_ID }) })
    );
  });

  it("falls back to 0 when there are no rows", async () => {
    (deliveryAggregate as Mock).mockResolvedValue({ _avg: { attempts: null } });
    const result = await getAverageAttempts(ORG_ID, new Date(), new Date());
    expect(result).toBe(0);
  });
});

describe("getRetryBacklogCount (test: retry backlog formula)", () => {
  it("counts FAILED, attempts < maxAttempts, due now or null nextAttemptAt — via raw SQL", async () => {
    (queryRaw as Mock).mockResolvedValue([{ cnt: 7 }]);
    const now = new Date("2026-06-24T10:00:00Z");

    const result = await getRetryBacklogCount(ORG_ID, now);

    expect(result).toBe(7);
    const { sql, values } = flattenSql((queryRaw as Mock).mock.calls[0][0]);
    expect(sql).toContain("status = 'FAILED'");
    expect(sql).toContain("attempts < maxAttempts");
    expect(values).toContain(ORG_ID);
    expect(values).toContain(now);
  });
});

describe("getTerminalFailureCount (watchlist CRITICAL — terminal failures)", () => {
  it("counts FAILED with attempts exhausted via raw SQL, scoped by organizationId", async () => {
    (queryRaw as Mock).mockResolvedValue([{ cnt: 3 }]);
    const result = await getTerminalFailureCount(ORG_ID);
    expect(result).toBe(3);
    const { sql, values } = flattenSql((queryRaw as Mock).mock.calls[0][0]);
    expect(sql).toContain("attempts >= maxAttempts");
    expect(values).toContain(ORG_ID);
  });
});

describe("getStaleRetryableFailureCount (watchlist HIGH — stale retryable)", () => {
  it("counts FAILED, retryable, older than the cutoff via raw SQL", async () => {
    (queryRaw as Mock).mockResolvedValue([{ cnt: 4 }]);
    const cutoff = new Date("2026-06-23T00:00:00Z");
    const result = await getStaleRetryableFailureCount(ORG_ID, cutoff);
    expect(result).toBe(4);
    const { sql, values } = flattenSql((queryRaw as Mock).mock.calls[0][0]);
    expect(sql).toContain("attempts < maxAttempts");
    expect(sql).toContain("createdAt <");
    expect(values).toContain(cutoff);
  });
});

describe("getStuckProcessingCount (watchlist HIGH — stuck processing)", () => {
  it("counts PROCESSING older than the cutoff using a plain Prisma count (no raw SQL)", async () => {
    (deliveryCount as Mock).mockResolvedValue(2);
    const cutoff = new Date("2026-06-24T09:30:00Z");
    const result = await getStuckProcessingCount(ORG_ID, cutoff);
    expect(result).toBe(2);
    expect(deliveryCount).toHaveBeenCalledWith({
      where: {
        organizationId: ORG_ID,
        status: "PROCESSING",
        OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lt: cutoff } }],
      },
    });
    expect(queryRaw).not.toHaveBeenCalled();
  });
});

describe("getEmailFailureCountByExactReason (watchlist CRITICAL — provider not configured)", () => {
  it("counts EMAIL/FAILED deliveries matching the exact reason string", async () => {
    (deliveryCount as Mock).mockResolvedValue(5);
    const result = await getEmailFailureCountByExactReason(ORG_ID, "Fornecedor não configurado");
    expect(result).toBe(5);
    expect(deliveryCount).toHaveBeenCalledWith({
      where: { organizationId: ORG_ID, channel: "EMAIL", status: "FAILED", failureReason: "Fornecedor não configurado" },
    });
  });
});

describe("getEmailFailureCountByKeywords (watchlist CRITICAL — auth/config issue)", () => {
  it("counts EMAIL/FAILED deliveries matching any keyword, excluding the exact reason", async () => {
    (deliveryCount as Mock).mockResolvedValue(2);
    const result = await getEmailFailureCountByKeywords(ORG_ID, ["autenticação", "TLS/certificado"], "Fornecedor não configurado");
    expect(result).toBe(2);
    expect(deliveryCount).toHaveBeenCalledWith({
      where: {
        organizationId: ORG_ID,
        channel: "EMAIL",
        status: "FAILED",
        NOT: { failureReason: "Fornecedor não configurado" },
        OR: [{ failureReason: { contains: "autenticação" } }, { failureReason: { contains: "TLS/certificado" } }],
      },
    });
  });
});

describe("getRecentEmailFailureCount (watchlist CRITICAL — repeated failures)", () => {
  it("counts EMAIL/FAILED deliveries created since the given time", async () => {
    (deliveryCount as Mock).mockResolvedValue(6);
    const since = new Date("2026-06-23T10:00:00Z");
    const result = await getRecentEmailFailureCount(ORG_ID, since);
    expect(result).toBe(6);
    expect(deliveryCount).toHaveBeenCalledWith({
      where: { organizationId: ORG_ID, channel: "EMAIL", status: "FAILED", createdAt: { gte: since } },
    });
  });
});

describe("getDailyVolume (test 9 — daily volume grouped in SQL)", () => {
  it("groups each metric by day via SQL FORMAT(), merges and zero-fills the full range", async () => {
    (queryRaw as Mock)
      .mockResolvedValueOnce([{ day: "2026-06-01", cnt: 2 }]) // createdAt
      .mockResolvedValueOnce([{ day: "2026-06-02", cnt: 1 }]) // sentAt
      .mockResolvedValueOnce([{ day: "2026-06-01", cnt: 1 }]) // deliveredAt
      .mockResolvedValueOnce([]); // failedAt

    const result = await getDailyVolume(ORG_ID, new Date("2026-06-01"), new Date("2026-06-02"));

    expect(result).toEqual([
      { date: "2026-06-01", pendingCreated: 2, sent: 0, delivered: 1, failed: 0 },
      { date: "2026-06-02", pendingCreated: 0, sent: 1, delivered: 0, failed: 0 },
    ]);
    expect(queryRaw).toHaveBeenCalledTimes(4);
    for (const call of (queryRaw as Mock).mock.calls) {
      const { sql, values } = flattenSql(call[0]);
      expect(sql).toContain("GROUP BY FORMAT(");
      expect(values).toContain(ORG_ID);
    }
  });
});

describe("getStatusDistribution (test 10 — status distribution grouped in SQL)", () => {
  it("groups by status within the date range", async () => {
    (deliveryGroupBy as Mock).mockResolvedValue([
      { status: "PENDING", _count: { _all: 4 } },
      { status: "FAILED", _count: { _all: 1 } },
    ]);
    const result = await getStatusDistribution(ORG_ID, new Date("2026-06-01"), new Date("2026-06-30"));
    expect(result).toEqual([
      { status: "PENDING", count: 4 },
      { status: "FAILED", count: 1 },
    ]);
    expect(deliveryGroupBy).toHaveBeenCalledWith(expect.objectContaining({ by: ["status"] }));
  });
});

describe("getChannelHealth (test 11 — channel health grouped in SQL)", () => {
  it("groups by [channel, status] in SQL, then reduces the small aggregated result into success/failure per channel", async () => {
    (deliveryGroupBy as Mock).mockResolvedValue([
      { channel: "EMAIL", status: "SENT", _count: { _all: 8 } },
      { channel: "EMAIL", status: "FAILED", _count: { _all: 2 } },
      { channel: "IN_APP", status: "DELIVERED", _count: { _all: 10 } },
    ]);

    const result = await getChannelHealth(ORG_ID, new Date("2026-06-01"), new Date("2026-06-30"));

    expect(deliveryGroupBy).toHaveBeenCalledWith(expect.objectContaining({ by: ["channel", "status"] }));
    const email = result.find((r) => r.channel === "EMAIL");
    expect(email).toEqual({ channel: "EMAIL", successCount: 8, failureCount: 2, successRate: 80 });
    const inApp = result.find((r) => r.channel === "IN_APP");
    expect(inApp).toEqual({ channel: "IN_APP", successCount: 10, failureCount: 0, successRate: 100 });
  });
});

describe("getFailureReasons (test 12 — failure reasons grouped and sorted in SQL, M2 fix)", () => {
  it("groups by failureReason where status=FAILED, excluding nulls in SQL, ordered desc by count, capped at 10 — all via groupBy params", async () => {
    (deliveryGroupBy as Mock).mockResolvedValue([
      { failureReason: "Falha B", _count: { _all: 9 } },
      { failureReason: "Falha A", _count: { _all: 3 } },
    ]);

    const result = await getFailureReasons(ORG_ID, new Date("2026-06-01"), new Date("2026-06-30"));

    expect(deliveryGroupBy).toHaveBeenCalledWith({
      by: ["failureReason"],
      where: {
        organizationId: ORG_ID,
        status: "FAILED",
        createdAt: { gte: new Date("2026-06-01"), lte: new Date("2026-06-30") },
        failureReason: { not: null },
      },
      _count: { _all: true },
      orderBy: { _count: { failureReason: "desc" } },
      take: 10,
    });
    // No JS re-sort/re-slice — the function trusts SQL's ORDER BY/take and
    // returns the DB's row order as-is (regression guard for M2).
    expect(result).toEqual([
      { failureReason: "Falha B", count: 9 },
      { failureReason: "Falha A", count: 3 },
    ]);
  });
});

describe("getTopEvents (test 13 — top events grouped and sorted in SQL, M2 fix)", () => {
  it("groups Notification rows by type, ordered desc by count and capped at 10 — all via groupBy params", async () => {
    (notificationGroupBy as Mock).mockResolvedValue([
      { type: "enrollment.activated", _count: { _all: 12 } },
      { type: "payment.confirmed", _count: { _all: 5 } },
    ]);

    const result = await getTopEvents(ORG_ID, new Date("2026-06-01"), new Date("2026-06-30"));

    expect(notificationGroupBy).toHaveBeenCalledWith({
      by: ["type"],
      where: { organizationId: ORG_ID, createdAt: { gte: new Date("2026-06-01"), lte: new Date("2026-06-30") } },
      _count: { _all: true },
      orderBy: { _count: { type: "desc" } },
      take: 10,
    });
    // No JS re-sort/re-slice — regression guard for M2.
    expect(result).toEqual([
      { type: "enrollment.activated", count: 12 },
      { type: "payment.confirmed", count: 5 },
    ]);
  });
});

describe("getProblemDeliveries (tests 19-22 — pagination, filters, sorting, tenant isolation)", () => {
  function makeRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "delivery-1",
      organizationId: ORG_ID,
      notificationId: "notif-1",
      channel: "EMAIL",
      recipient: "user@example.com",
      status: "FAILED",
      attempts: 1,
      maxAttempts: 3,
      nextAttemptAt: null,
      failureReason: "Fornecedor não configurado",
      createdAt: new Date(),
      notification: { title: "Pagamento confirmado", type: "payment.confirmed" },
      ...overrides,
    };
  }

  it("defaults to FAILED + PENDING + PROCESSING when no status filter is given (test 20)", async () => {
    (deliveryFindMany as Mock).mockResolvedValue([makeRow()]);
    (deliveryCount as Mock).mockResolvedValue(1);

    await getProblemDeliveries(ORG_ID, {});

    expect(deliveryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_ID, status: { in: ["FAILED", "PENDING", "PROCESSING"] } }),
      })
    );
  });

  it("uses the explicit status filter instead of the default set when given (test 20)", async () => {
    (deliveryFindMany as Mock).mockResolvedValue([]);
    (deliveryCount as Mock).mockResolvedValue(0);

    await getProblemDeliveries(ORG_ID, { status: "DELIVERED" });

    expect(deliveryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "DELIVERED" }) })
    );
  });

  it("filters by channel, failureReason substring and eventType (relation filter) (test 20)", async () => {
    (deliveryFindMany as Mock).mockResolvedValue([]);
    (deliveryCount as Mock).mockResolvedValue(0);

    await getProblemDeliveries(ORG_ID, {
      channel: "EMAIL",
      failureReason: "configurado",
      eventType: "payment.confirmed",
    });

    expect(deliveryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          channel: "EMAIL",
          failureReason: { contains: "configurado" },
          notification: { type: "payment.confirmed" },
        }),
      })
    );
  });

  it("paginates server-side via skip/take (test 19)", async () => {
    (deliveryFindMany as Mock).mockResolvedValue([makeRow()]);
    (deliveryCount as Mock).mockResolvedValue(45);

    const result = await getProblemDeliveries(ORG_ID, { page: 2, pageSize: 20 });

    expect(deliveryFindMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 20 }));
    expect(result.total).toBe(45);
  });

  it("sorts by createdAt desc (test 21)", async () => {
    (deliveryFindMany as Mock).mockResolvedValue([]);
    (deliveryCount as Mock).mockResolvedValue(0);

    await getProblemDeliveries(ORG_ID, {});

    expect(deliveryFindMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { createdAt: "desc" } }));
  });

  it("never scopes by another organization's id (tenant isolation, test 22)", async () => {
    (deliveryFindMany as Mock).mockResolvedValue([]);
    (deliveryCount as Mock).mockResolvedValue(0);

    await getProblemDeliveries(OTHER_ORG_ID, {});

    expect(deliveryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: OTHER_ORG_ID }) })
    );
  });

  it("maps the joined notification title/type onto the row", async () => {
    (deliveryFindMany as Mock).mockResolvedValue([makeRow()]);
    (deliveryCount as Mock).mockResolvedValue(1);

    const result = await getProblemDeliveries(ORG_ID, {});

    expect(result.data[0]).toMatchObject({
      notificationTitle: "Pagamento confirmado",
      notificationType: "payment.confirmed",
    });
  });
});

describe("no full-table loads for chart/KPI aggregates (test 25)", () => {
  it("chart and KPI functions never call findMany on NotificationDelivery", async () => {
    (deliveryGroupBy as Mock).mockResolvedValue([]);
    (deliveryAggregate as Mock).mockResolvedValue({ _avg: { attempts: null } });
    (queryRaw as Mock).mockResolvedValue([{ cnt: 0 }]);
    (notificationGroupBy as Mock).mockResolvedValue([]);

    await Promise.all([
      getStatusCountsInRange(ORG_ID, new Date(), new Date()),
      getAverageAttempts(ORG_ID, new Date(), new Date()),
      getRetryBacklogCount(ORG_ID, new Date()),
      getTerminalFailureCount(ORG_ID),
      getDailyVolume(ORG_ID, new Date("2026-06-01"), new Date("2026-06-02")),
      getStatusDistribution(ORG_ID, new Date(), new Date()),
      getChannelHealth(ORG_ID, new Date(), new Date()),
      getFailureReasons(ORG_ID, new Date(), new Date()),
      getTopEvents(ORG_ID, new Date(), new Date()),
    ]);

    expect(deliveryFindMany).not.toHaveBeenCalled();
  });
});
