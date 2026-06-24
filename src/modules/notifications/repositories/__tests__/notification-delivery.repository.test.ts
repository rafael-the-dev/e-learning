import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

const { create, findMany, findFirst, count, groupBy, updateMany } = vi.hoisted(() => ({
  create: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  count: vi.fn(),
  groupBy: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  getDb: vi.fn().mockResolvedValue({
    notificationDelivery: { create, findMany, findFirst, count, groupBy, updateMany },
  }),
}));

import {
  createDelivery,
  createManyDeliveries,
  findDeliveryById,
  findByNotification,
  listDeliveries,
  countByStatus,
  markProcessing,
  markSent,
  markDelivered,
  markFailed,
  markRetryPending,
  cancelDelivery,
  findDueDeliveries,
  findRetryEligibleDeliveries,
  bulkRetryDeliveries,
} from "../notification-delivery.repository";

const ORG_ID = "org-1";
const OTHER_ORG_ID = "org-2";

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "delivery-1",
    organizationId: ORG_ID,
    notificationId: "notif-1",
    channel: "IN_APP",
    recipient: "user-1",
    status: "PENDING",
    provider: null,
    providerMessageId: null,
    attempts: 0,
    maxAttempts: 3,
    lastAttemptAt: null,
    nextAttemptAt: null,
    sentAt: null,
    deliveredAt: null,
    failedAt: null,
    cancelledAt: null,
    failureReason: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("createDelivery", () => {
  it("inserts a row scoped to the organization", async () => {
    (create as Mock).mockResolvedValue(makeRow());

    await createDelivery(ORG_ID, { notificationId: "notif-1", channel: "IN_APP", recipient: "user-1" });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: ORG_ID,
        notificationId: "notif-1",
        channel: "IN_APP",
        recipient: "user-1",
        status: "PENDING",
      }),
    });
  });

  it("sets failedAt when a failureReason is provided at creation", async () => {
    (create as Mock).mockResolvedValue(makeRow({ status: "FAILED", failureReason: "Destinatário indisponível" }));

    await createDelivery(ORG_ID, {
      notificationId: "notif-1",
      channel: "EMAIL",
      recipient: "",
      status: "FAILED",
      failureReason: "Destinatário indisponível",
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: "FAILED", failureReason: "Destinatário indisponível", failedAt: expect.any(Date) }),
    });
  });
});

describe("createManyDeliveries", () => {
  it("creates one row per input", async () => {
    (create as Mock).mockResolvedValue(makeRow());

    const result = await createManyDeliveries(ORG_ID, [
      { notificationId: "notif-1", channel: "IN_APP", recipient: "user-1" },
      { notificationId: "notif-1", channel: "EMAIL", recipient: "user@example.com" },
    ]);

    expect(create).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
  });
});

describe("findDeliveryById / findByNotification — tenant isolation", () => {
  it("scopes findDeliveryById by organizationId", async () => {
    (findFirst as Mock).mockResolvedValue(null);
    const result = await findDeliveryById("delivery-1", OTHER_ORG_ID);
    expect(result).toBeNull();
    expect(findFirst).toHaveBeenCalledWith({ where: { id: "delivery-1", organizationId: OTHER_ORG_ID } });
  });

  it("scopes findByNotification by organizationId", async () => {
    (findMany as Mock).mockResolvedValue([makeRow()]);
    await findByNotification("notif-1", ORG_ID);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { notificationId: "notif-1", organizationId: ORG_ID } })
    );
  });
});

describe("listDeliveries — filters", () => {
  it("filters by status, channel and recipient substring, always scoped by organizationId", async () => {
    (findMany as Mock).mockResolvedValue([makeRow()]);
    (count as Mock).mockResolvedValue(1);

    await listDeliveries(ORG_ID, { status: "FAILED", channel: "EMAIL", recipient: "user@" });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: ORG_ID,
          status: "FAILED",
          channel: "EMAIL",
          recipient: { contains: "user@" },
        },
      })
    );
  });

  it("returns total alongside the page of data", async () => {
    (findMany as Mock).mockResolvedValue([makeRow()]);
    (count as Mock).mockResolvedValue(42);

    const result = await listDeliveries(ORG_ID, {});

    expect(result.total).toBe(42);
    expect(result.data).toHaveLength(1);
  });
});

describe("countByStatus", () => {
  it("maps groupBy rows into a status -> count record", async () => {
    (groupBy as Mock).mockResolvedValue([
      { status: "PENDING", _count: { _all: 2 } },
      { status: "DELIVERED", _count: { _all: 5 } },
    ]);

    const result = await countByStatus(ORG_ID);

    expect(result).toEqual({ PENDING: 2, DELIVERED: 5 });
  });
});

describe("status transition writes — conditional on expectedStatus (M2)", () => {
  it("markProcessing increments attempts and sets lastAttemptAt, guarded by expectedStatus", async () => {
    (updateMany as Mock).mockResolvedValue({ count: 1 });
    await markProcessing("delivery-1", ORG_ID, "PENDING");
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "delivery-1", organizationId: ORG_ID, status: "PENDING" },
      data: { status: "PROCESSING", attempts: { increment: 1 }, lastAttemptAt: expect.any(Date) },
    });
  });

  it("markSent sets sentAt and optional providerMessageId", async () => {
    (updateMany as Mock).mockResolvedValue({ count: 1 });
    await markSent("delivery-1", ORG_ID, "PROCESSING", "msg-123");
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "delivery-1", organizationId: ORG_ID, status: "PROCESSING" },
      data: { status: "SENT", sentAt: expect.any(Date), providerMessageId: "msg-123" },
    });
  });

  it("markSent also sets provider when given (Phase 3.2A)", async () => {
    (updateMany as Mock).mockResolvedValue({ count: 1 });
    await markSent("delivery-1", ORG_ID, "PROCESSING", "msg-123", "noop-email");
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "delivery-1", organizationId: ORG_ID, status: "PROCESSING" },
      data: { status: "SENT", sentAt: expect.any(Date), providerMessageId: "msg-123", provider: "noop-email" },
    });
  });

  it("markDelivered sets deliveredAt", async () => {
    (updateMany as Mock).mockResolvedValue({ count: 1 });
    await markDelivered("delivery-1", ORG_ID, "SENT");
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "delivery-1", organizationId: ORG_ID, status: "SENT" },
      data: { status: "DELIVERED", deliveredAt: expect.any(Date) },
    });
  });

  it("markFailed sets failureReason and nextAttemptAt", async () => {
    (updateMany as Mock).mockResolvedValue({ count: 1 });
    const nextAttemptAt = new Date();
    await markFailed("delivery-1", ORG_ID, "PROCESSING", "Fornecedor não configurado", nextAttemptAt);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "delivery-1", organizationId: ORG_ID, status: "PROCESSING" },
      data: { status: "FAILED", failedAt: expect.any(Date), failureReason: "Fornecedor não configurado", nextAttemptAt },
    });
  });

  it("markFailed also sets provider when given (Phase 3.2A, test #11)", async () => {
    (updateMany as Mock).mockResolvedValue({ count: 1 });
    const nextAttemptAt = new Date();
    await markFailed("delivery-1", ORG_ID, "PROCESSING", "Fornecedor não configurado", nextAttemptAt, "noop-email");
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "delivery-1", organizationId: ORG_ID, status: "PROCESSING" },
      data: {
        status: "FAILED",
        failedAt: expect.any(Date),
        failureReason: "Fornecedor não configurado",
        nextAttemptAt,
        provider: "noop-email",
      },
    });
  });

  it("markRetryPending clears failureReason and sets status back to PENDING", async () => {
    (updateMany as Mock).mockResolvedValue({ count: 1 });
    await markRetryPending("delivery-1", ORG_ID, "FAILED");
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "delivery-1", organizationId: ORG_ID, status: "FAILED" },
      data: { status: "PENDING", failureReason: null, nextAttemptAt: expect.any(Date) },
    });
  });

  it("cancelDelivery sets CANCELLED and cancelledAt", async () => {
    (updateMany as Mock).mockResolvedValue({ count: 1 });
    await cancelDelivery("delivery-1", ORG_ID, "PENDING");
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "delivery-1", organizationId: ORG_ID, status: "PENDING" },
      data: { status: "CANCELLED", cancelledAt: expect.any(Date) },
    });
  });

  it("throws ConcurrencyError when the row no longer matches expectedStatus (competing transition already applied)", async () => {
    (updateMany as Mock).mockResolvedValue({ count: 0 });
    await expect(markProcessing("delivery-1", ORG_ID, "PENDING")).rejects.toThrow(/concurrently/);
  });

  it("throws ConcurrencyError for cancelDelivery when another process already moved the row", async () => {
    (updateMany as Mock).mockResolvedValue({ count: 0 });
    await expect(cancelDelivery("delivery-1", ORG_ID, "PENDING")).rejects.toThrow(/concurrently/);
  });
});

describe("findDueDeliveries", () => {
  it("queries PENDING deliveries with no nextAttemptAt or one in the past", async () => {
    (findMany as Mock).mockResolvedValue([makeRow()]);
    const now = new Date();

    await findDueDeliveries(ORG_ID, now);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: ORG_ID,
          status: "PENDING",
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
        },
      })
    );
  });

  it("does not pass `take` when no limit is given", async () => {
    (findMany as Mock).mockResolvedValue([]);
    await findDueDeliveries(ORG_ID, new Date());
    expect((findMany as Mock).mock.calls[0][0]).not.toHaveProperty("take");
  });

  it("passes `take` when a limit is given (Phase 3.2B §6)", async () => {
    (findMany as Mock).mockResolvedValue([]);
    await findDueDeliveries(ORG_ID, new Date(), 100);
    expect((findMany as Mock).mock.calls[0][0]).toMatchObject({ take: 100 });
  });
});

describe("findRetryEligibleDeliveries (tests #19-23)", () => {
  it("queries FAILED deliveries due for retry, scoped by organizationId", async () => {
    (findMany as Mock).mockResolvedValue([makeRow({ status: "FAILED", attempts: 1, maxAttempts: 3 })]);
    const now = new Date();

    await findRetryEligibleDeliveries(ORG_ID, now);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORG_ID,
        status: "FAILED",
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
    });
  });

  it("omits organizationId from the where clause when not given", async () => {
    (findMany as Mock).mockResolvedValue([]);
    await findRetryEligibleDeliveries(undefined, new Date());
    expect((findMany as Mock).mock.calls[0][0].where).not.toHaveProperty("organizationId");
  });

  it("filters out deliveries that have exhausted maxAttempts (test #21)", async () => {
    (findMany as Mock).mockResolvedValue([
      makeRow({ id: "eligible", attempts: 1, maxAttempts: 3 }),
      makeRow({ id: "exhausted", attempts: 3, maxAttempts: 3 }),
    ]);

    const result = await findRetryEligibleDeliveries(ORG_ID, new Date());

    expect(result.map((d) => d.id)).toEqual(["eligible"]);
  });
});

describe("bulkRetryDeliveries", () => {
  it("returns 0 without querying the DB for an empty id list", async () => {
    const result = await bulkRetryDeliveries([], new Date());
    expect(result).toBe(0);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("bulk-transitions the given ids to PENDING, re-checking status FAILED", async () => {
    (updateMany as Mock).mockResolvedValue({ count: 2 });
    const now = new Date();

    const result = await bulkRetryDeliveries(["d1", "d2"], now);

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["d1", "d2"] }, status: "FAILED" },
      data: { status: "PENDING", failureReason: null, nextAttemptAt: now, cancelledAt: null },
    });
    expect(result).toBe(2);
  });
});
