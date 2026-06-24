import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/modules/notifications/repositories/notification-delivery.repository", () => ({
  countByStatus: vi.fn(),
}));

vi.mock("@/modules/notifications/repositories/notification-event-rule.repository", () => ({
  findManyRules: vi.fn(),
}));

vi.mock("@/modules/notifications/repositories/notification-email-settings.repository", () => ({
  findByOrganization: vi.fn(),
}));

vi.mock("@/modules/notifications/repositories/notification-operations.repository", () => ({
  getStatusCountsInRange: vi.fn(),
  getAverageAttempts: vi.fn(),
  getRetryBacklogCount: vi.fn(),
  getTerminalFailureCount: vi.fn(),
  getStaleRetryableFailureCount: vi.fn(),
  getStuckProcessingCount: vi.fn(),
  getEmailFailureCountByExactReason: vi.fn(),
  getEmailFailureCountByKeywords: vi.fn(),
  getRecentEmailFailureCount: vi.fn(),
  getDailyVolume: vi.fn(),
  getStatusDistribution: vi.fn(),
  getChannelHealth: vi.fn(),
  getFailureReasons: vi.fn(),
  getTopEvents: vi.fn(),
  getProblemDeliveries: vi.fn(),
}));

import { countByStatus } from "@/modules/notifications/repositories/notification-delivery.repository";
import { findManyRules } from "@/modules/notifications/repositories/notification-event-rule.repository";
import { findByOrganization as findEmailSettings } from "@/modules/notifications/repositories/notification-email-settings.repository";
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
  getChannelHealth,
  getProblemDeliveries as getProblemDeliveriesRepo,
} from "@/modules/notifications/repositories/notification-operations.repository";
import {
  getOperationsKpis,
  getDeliveryOperationsWatchlist,
  getProblemDeliveries,
} from "../notification-operations.service";

const ORG_ID = "org-1";
const NOW = new Date("2026-06-24T12:00:00Z");
const RANGE = { dateFrom: new Date("2026-06-01"), dateTo: new Date("2026-06-30") };

function defaultMocks() {
  (countByStatus as Mock).mockResolvedValue({});
  (getStatusCountsInRange as Mock).mockResolvedValue({});
  (getRetryBacklogCount as Mock).mockResolvedValue(0);
  (getAverageAttempts as Mock).mockResolvedValue(0);
  (getTerminalFailureCount as Mock).mockResolvedValue(0);
  (getStaleRetryableFailureCount as Mock).mockResolvedValue(0);
  (getStuckProcessingCount as Mock).mockResolvedValue(0);
  (getEmailFailureCountByExactReason as Mock).mockResolvedValue(0);
  (getEmailFailureCountByKeywords as Mock).mockResolvedValue(0);
  (getRecentEmailFailureCount as Mock).mockResolvedValue(0);
  (findEmailSettings as Mock).mockResolvedValue(null);
  (findManyRules as Mock).mockResolvedValue([]);
  (getChannelHealth as Mock).mockResolvedValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  defaultMocks();
});

describe("getOperationsKpis", () => {
  it("pending/processing are current-state, ignoring the selected period (test 1, 2)", async () => {
    (countByStatus as Mock).mockResolvedValue({ PENDING: 9, PROCESSING: 4 });
    (getStatusCountsInRange as Mock).mockResolvedValue({ PENDING: 1, PROCESSING: 1 });

    const result = await getOperationsKpis(ORG_ID, RANGE, NOW);

    expect(result.pending).toBe(9);
    expect(result.processing).toBe(4);
  });

  it("sent/delivered/failed/cancelled are period-scoped (test 3, 4, 5, 6)", async () => {
    (getStatusCountsInRange as Mock).mockResolvedValue({ SENT: 10, DELIVERED: 5, FAILED: 3, CANCELLED: 2 });

    const result = await getOperationsKpis(ORG_ID, RANGE, NOW);

    expect(result.sent).toBe(10);
    expect(result.delivered).toBe(5);
    expect(result.failed).toBe(3);
    expect(result.cancelled).toBe(2);
  });

  it("computes success rate as (SENT + DELIVERED) / non-cancelled total * 100 (test 7)", async () => {
    (getStatusCountsInRange as Mock).mockResolvedValue({
      SENT: 6,
      DELIVERED: 2,
      FAILED: 1,
      CANCELLED: 5,
      PENDING: 1,
      PROCESSING: 0,
    });

    const result = await getOperationsKpis(ORG_ID, RANGE, NOW);

    // non-cancelled total = 6 + 2 + 1 + 1 + 0 = 10; (6+2)/10*100 = 80
    expect(result.successRate).toBe(80);
  });

  it("returns 0% success rate when there are no non-cancelled deliveries in the period", async () => {
    (getStatusCountsInRange as Mock).mockResolvedValue({ CANCELLED: 4 });
    const result = await getOperationsKpis(ORG_ID, RANGE, NOW);
    expect(result.successRate).toBe(0);
  });

  it("passes the retry backlog count through unchanged, current-state (test 8)", async () => {
    (getRetryBacklogCount as Mock).mockResolvedValue(13);
    const result = await getOperationsKpis(ORG_ID, RANGE, NOW);
    expect(result.retryBacklog).toBe(13);
    expect(getRetryBacklogCount).toHaveBeenCalledWith(ORG_ID, NOW);
  });
});

describe("getDeliveryOperationsWatchlist", () => {
  it("flags terminal FAILED deliveries as CRITICAL (test 14)", async () => {
    (getTerminalFailureCount as Mock).mockResolvedValue(3);

    const result = await getDeliveryOperationsWatchlist(ORG_ID, NOW);

    const item = result.find((i) => i.type === "TERMINAL_FAILURES");
    expect(item).toBeDefined();
    expect(item?.severity).toBe("CRITICAL");
    expect(item?.count).toBe(3);
  });

  it("flags EMAIL failures with 'Fornecedor não configurado' as CRITICAL (test 15)", async () => {
    (getEmailFailureCountByExactReason as Mock).mockResolvedValue(4);

    const result = await getDeliveryOperationsWatchlist(ORG_ID, NOW);

    const item = result.find((i) => i.type === "EMAIL_PROVIDER_NOT_CONFIGURED");
    expect(item).toBeDefined();
    expect(item?.severity).toBe("CRITICAL");
    expect(item?.channel).toBe("EMAIL");
    expect(item?.count).toBe(4);
  });

  it("flags an enabled-but-repeatedly-failing EMAIL provider as CRITICAL (test 15)", async () => {
    (findEmailSettings as Mock).mockResolvedValue({ isEnabled: true });
    (getRecentEmailFailureCount as Mock).mockResolvedValue(6);

    const result = await getDeliveryOperationsWatchlist(ORG_ID, NOW);

    const item = result.find((i) => i.type === "EMAIL_ENABLED_BUT_REPEATEDLY_FAILING");
    expect(item).toBeDefined();
    expect(item?.severity).toBe("CRITICAL");
  });

  it("does not flag repeated EMAIL failures when email settings are disabled", async () => {
    (findEmailSettings as Mock).mockResolvedValue({ isEnabled: false });
    (getRecentEmailFailureCount as Mock).mockResolvedValue(99);

    const result = await getDeliveryOperationsWatchlist(ORG_ID, NOW);

    expect(result.find((i) => i.type === "EMAIL_ENABLED_BUT_REPEATEDLY_FAILING")).toBeUndefined();
  });

  it("flags PROCESSING deliveries stuck for longer than 30 minutes as HIGH (test 16)", async () => {
    (getStuckProcessingCount as Mock).mockResolvedValue(5);

    const result = await getDeliveryOperationsWatchlist(ORG_ID, NOW);

    const item = result.find((i) => i.type === "STUCK_PROCESSING");
    expect(item).toBeDefined();
    expect(item?.severity).toBe("HIGH");
    expect(item?.count).toBe(5);
  });

  it("flags EMAIL disabled but an event rule still has the EMAIL channel enabled as MEDIUM (test 17)", async () => {
    (findEmailSettings as Mock).mockResolvedValue(null);
    (findManyRules as Mock).mockResolvedValue([
      { channels: ["IN_APP"] },
      { channels: ["IN_APP", "EMAIL"] },
    ]);

    const result = await getDeliveryOperationsWatchlist(ORG_ID, NOW);

    const item = result.find((i) => i.type === "EMAIL_DISABLED_BUT_RULE_ENABLED");
    expect(item).toBeDefined();
    expect(item?.severity).toBe("MEDIUM");
    expect(item?.count).toBe(1);
  });

  it("does not flag EMAIL_DISABLED_BUT_RULE_ENABLED when email is enabled", async () => {
    (findEmailSettings as Mock).mockResolvedValue({ isEnabled: true });
    (findManyRules as Mock).mockResolvedValue([{ channels: ["EMAIL"] }]);

    const result = await getDeliveryOperationsWatchlist(ORG_ID, NOW);

    expect(result.find((i) => i.type === "EMAIL_DISABLED_BUT_RULE_ENABLED")).toBeUndefined();
  });

  it("flags a channel with a failure rate above 20% (with enough volume) as MEDIUM (test 18)", async () => {
    (getChannelHealth as Mock).mockResolvedValue([
      { channel: "EMAIL", successCount: 7, failureCount: 3, successRate: 70 },
    ]);

    const result = await getDeliveryOperationsWatchlist(ORG_ID, NOW);

    const item = result.find((i) => i.type === "HIGH_CHANNEL_FAILURE_RATE");
    expect(item).toBeDefined();
    expect(item?.severity).toBe("MEDIUM");
    expect(item?.channel).toBe("EMAIL");
  });

  it("does not flag a channel's failure rate when volume is below the minimum threshold", async () => {
    (getChannelHealth as Mock).mockResolvedValue([
      { channel: "EMAIL", successCount: 1, failureCount: 2, successRate: 33 },
    ]);

    const result = await getDeliveryOperationsWatchlist(ORG_ID, NOW);

    expect(result.find((i) => i.type === "HIGH_CHANNEL_FAILURE_RATE")).toBeUndefined();
  });

  it("excludes IN_APP from channel failure-rate alerting", async () => {
    (getChannelHealth as Mock).mockResolvedValue([
      { channel: "IN_APP", successCount: 1, failureCount: 20, successRate: 5 },
    ]);

    const result = await getDeliveryOperationsWatchlist(ORG_ID, NOW);

    expect(result.find((i) => i.type === "HIGH_CHANNEL_FAILURE_RATE")).toBeUndefined();
  });

  it("flags an elevated pending queue as LOW", async () => {
    (countByStatus as Mock).mockResolvedValue({ PENDING: 25 });

    const result = await getDeliveryOperationsWatchlist(ORG_ID, NOW);

    const item = result.find((i) => i.type === "HIGH_PENDING_VOLUME");
    expect(item).toBeDefined();
    expect(item?.severity).toBe("LOW");
  });

  it("returns no items when every metric is healthy", async () => {
    const result = await getDeliveryOperationsWatchlist(ORG_ID, NOW);
    expect(result).toEqual([]);
  });

  it("sorts items by severity, CRITICAL first", async () => {
    (countByStatus as Mock).mockResolvedValue({ PENDING: 25 });
    (getTerminalFailureCount as Mock).mockResolvedValue(1);
    (getStuckProcessingCount as Mock).mockResolvedValue(1);

    const result = await getDeliveryOperationsWatchlist(ORG_ID, NOW);

    const severities = result.map((i) => i.severity);
    expect(severities[0]).toBe("CRITICAL");
    expect(severities[severities.length - 1]).toBe("LOW");
  });
});

describe("getProblemDeliveries (service pagination wrapper)", () => {
  it("wraps the repository result with pagination metadata", async () => {
    (getProblemDeliveriesRepo as Mock).mockResolvedValue({ data: [{ id: "d1" }], total: 21 });

    const result = await getProblemDeliveries(ORG_ID, { page: 2, pageSize: 20 });

    expect(getProblemDeliveriesRepo).toHaveBeenCalledWith(ORG_ID, expect.objectContaining({ page: 2, pageSize: 20 }));
    expect(result.total).toBe(21);
    expect(result.page).toBe(2);
    expect(result.totalPages).toBe(2);
  });
});
