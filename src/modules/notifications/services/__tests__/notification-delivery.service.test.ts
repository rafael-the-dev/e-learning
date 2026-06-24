import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/modules/notifications/repositories/notification-delivery.repository", () => ({
  createManyDeliveries: vi.fn(),
  findDeliveryById: vi.fn(),
  findByNotification: vi.fn(),
  listDeliveries: vi.fn(),
  countByStatus: vi.fn(),
  markProcessing: vi.fn(),
  markSent: vi.fn(),
  markDelivered: vi.fn(),
  markFailed: vi.fn(),
  markRetryPending: vi.fn(),
  cancelDelivery: vi.fn(),
  findRetryEligibleDeliveries: vi.fn(),
  bulkRetryDeliveries: vi.fn(),
}));

vi.mock("@/modules/notifications/services/notification-recipient-resolver.service", () => ({
  resolveRecipient: vi.fn(),
}));

vi.mock("@/modules/audit-logs/services/audit.service", () => ({
  auditService: { log: vi.fn() },
}));

import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  createManyDeliveries,
  findDeliveryById,
  listDeliveries as listDeliveriesRepo,
  markProcessing as markProcessingRepo,
  markFailed as markFailedRepo,
  markRetryPending,
  cancelDelivery as cancelDeliveryRepo,
  findRetryEligibleDeliveries,
  bulkRetryDeliveries,
} from "@/modules/notifications/repositories/notification-delivery.repository";
import { resolveRecipient } from "@/modules/notifications/services/notification-recipient-resolver.service";
import {
  createDeliveriesForNotification,
  listDeliveries,
  startProcessing,
  markSent,
  markDelivered,
  markFailed,
  retryDelivery,
  cancelDelivery,
  runRetryJob,
} from "../notification-delivery.service";
import type { Notification } from "@/modules/notifications/types";

const ORG_ID = "org-1";

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "notif-1",
    organizationId: ORG_ID,
    recipientUserId: "user-1",
    type: "PAYMENT_RECEIVED",
    severity: "INFO",
    title: "T",
    message: "M",
    status: "UNREAD",
    actionUrl: null,
    metadata: null,
    readAt: null,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeDelivery(overrides: Record<string, unknown> = {}) {
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

describe("createDeliveriesForNotification — IN_APP (test #5)", () => {
  it("creates an IN_APP delivery already DELIVERED, with no recipient resolution", async () => {
    (createManyDeliveries as Mock).mockResolvedValue([makeDelivery({ channel: "IN_APP", status: "DELIVERED" })]);

    await createDeliveriesForNotification(ORG_ID, makeNotification(), ["IN_APP"]);

    expect(resolveRecipient).not.toHaveBeenCalled();
    expect(createManyDeliveries).toHaveBeenCalledWith(ORG_ID, [
      expect.objectContaining({
        notificationId: "notif-1",
        channel: "IN_APP",
        recipient: "user-1",
        status: "DELIVERED",
        deliveredAt: expect.any(Date),
      }),
    ]);
  });
});

describe("createDeliveriesForNotification — external channels (test #6)", () => {
  it("creates a PENDING delivery when a recipient resolves", async () => {
    (resolveRecipient as Mock).mockResolvedValue("user@example.com");
    (createManyDeliveries as Mock).mockResolvedValue([makeDelivery({ channel: "EMAIL", status: "PENDING" })]);

    await createDeliveriesForNotification(ORG_ID, makeNotification(), ["EMAIL"]);

    expect(createManyDeliveries).toHaveBeenCalledWith(ORG_ID, [
      expect.objectContaining({ channel: "EMAIL", recipient: "user@example.com", status: "PENDING" }),
    ]);
  });

  it("creates a FAILED delivery with 'Destinatário indisponível' when no recipient resolves", async () => {
    (resolveRecipient as Mock).mockResolvedValue(null);
    (createManyDeliveries as Mock).mockResolvedValue([makeDelivery({ channel: "WHATSAPP", status: "FAILED" })]);

    await createDeliveriesForNotification(ORG_ID, makeNotification(), ["WHATSAPP"]);

    expect(createManyDeliveries).toHaveBeenCalledWith(ORG_ID, [
      expect.objectContaining({ channel: "WHATSAPP", recipient: "", status: "FAILED", failureReason: "Destinatário indisponível" }),
    ]);
  });
});

describe("listDeliveries", () => {
  it("builds pagination metadata from the repository result", async () => {
    (listDeliveriesRepo as Mock).mockResolvedValue({ data: [makeDelivery()], total: 1 });

    const result = await listDeliveries(ORG_ID, {});

    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.data).toHaveLength(1);
  });
});

describe("status transitions (tests #7, #8)", () => {
  it("startProcessing transitions PENDING -> PROCESSING", async () => {
    (findDeliveryById as Mock)
      .mockResolvedValueOnce(makeDelivery({ status: "PENDING" }))
      .mockResolvedValueOnce(makeDelivery({ status: "PROCESSING" }));

    const result = await startProcessing("delivery-1", ORG_ID);

    expect(markProcessingRepo).toHaveBeenCalledWith("delivery-1", ORG_ID, "PENDING");
    expect(result.status).toBe("PROCESSING");
  });

  it("rejects PENDING -> DELIVERED (must go through PROCESSING/SENT first)", async () => {
    (findDeliveryById as Mock).mockResolvedValue(makeDelivery({ status: "PENDING" }));
    await expect(markDelivered("delivery-1", ORG_ID)).rejects.toThrow();
  });

  it("allows SENT -> DELIVERED", async () => {
    (findDeliveryById as Mock)
      .mockResolvedValueOnce(makeDelivery({ status: "SENT" }))
      .mockResolvedValueOnce(makeDelivery({ status: "DELIVERED" }));

    const result = await markDelivered("delivery-1", ORG_ID);
    expect(result.status).toBe("DELIVERED");
  });

  it("rejects DELIVERED -> any transition (terminal)", async () => {
    (findDeliveryById as Mock).mockResolvedValue(makeDelivery({ status: "DELIVERED" }));
    await expect(markSent("delivery-1", ORG_ID)).rejects.toThrow();
  });

  it("rejects CANCELLED -> any transition (terminal)", async () => {
    (findDeliveryById as Mock).mockResolvedValue(makeDelivery({ status: "CANCELLED" }));
    await expect(startProcessing("delivery-1", ORG_ID)).rejects.toThrow();
  });
});

describe("markFailed — maxAttempts respected (tests #9, #10)", () => {
  it("schedules a nextAttemptAt when attempts are still below maxAttempts", async () => {
    (findDeliveryById as Mock)
      .mockResolvedValueOnce(makeDelivery({ status: "PROCESSING", attempts: 1, maxAttempts: 3 }))
      .mockResolvedValueOnce(makeDelivery({ status: "FAILED", attempts: 1, maxAttempts: 3 }));

    await markFailed("delivery-1", ORG_ID, "Fornecedor não configurado");

    expect(markFailedRepo).toHaveBeenCalledWith(
      "delivery-1",
      ORG_ID,
      "PROCESSING",
      "Fornecedor não configurado",
      expect.any(Date),
      undefined
    );
  });

  it("does not schedule a retry once attempts >= maxAttempts", async () => {
    (findDeliveryById as Mock)
      .mockResolvedValueOnce(makeDelivery({ status: "PROCESSING", attempts: 3, maxAttempts: 3 }))
      .mockResolvedValueOnce(makeDelivery({ status: "FAILED", attempts: 3, maxAttempts: 3 }));

    await markFailed("delivery-1", ORG_ID, "Fornecedor não configurado");

    expect(markFailedRepo).toHaveBeenCalledWith("delivery-1", ORG_ID, "PROCESSING", "Fornecedor não configurado", null, undefined);
  });
});

describe("markFailed — exponential backoff (Phase 3.2B §8)", () => {
  it.each([
    [1, 5],
    [2, 15],
    [3, 60],
  ])("schedules nextAttemptAt ~%i minutes after attempt %i", async (attempts, minutes) => {
    (findDeliveryById as Mock)
      .mockResolvedValueOnce(makeDelivery({ status: "PROCESSING", attempts, maxAttempts: 5 }))
      .mockResolvedValueOnce(makeDelivery({ status: "FAILED", attempts, maxAttempts: 5 }));

    const before = Date.now();
    await markFailed("delivery-1", ORG_ID, "Falha");
    const after = Date.now();

    const nextAttemptAt = (markFailedRepo as Mock).mock.calls.at(-1)![4] as Date;
    const expectedMs = minutes * 60 * 1000;
    expect(nextAttemptAt.getTime() - before).toBeGreaterThanOrEqual(expectedMs - 1000);
    expect(nextAttemptAt.getTime() - after).toBeLessThanOrEqual(expectedMs + 1000);
  });
});

describe("markFailed — audit only on terminal failure (H2)", () => {
  it("does NOT audit a transient failure that still has attempts left", async () => {
    (findDeliveryById as Mock)
      .mockResolvedValueOnce(makeDelivery({ status: "PROCESSING", attempts: 1, maxAttempts: 3 }))
      .mockResolvedValueOnce(makeDelivery({ status: "FAILED", attempts: 1, maxAttempts: 3 }));

    await markFailed("delivery-1", ORG_ID, "Fornecedor não configurado");

    expect(auditService.log).not.toHaveBeenCalled();
  });

  it("audits a terminal failure once attempts are exhausted", async () => {
    (findDeliveryById as Mock)
      .mockResolvedValueOnce(makeDelivery({ status: "PROCESSING", attempts: 3, maxAttempts: 3 }))
      .mockResolvedValueOnce(makeDelivery({ status: "FAILED", attempts: 3, maxAttempts: 3 }));

    await markFailed("delivery-1", ORG_ID, "Fornecedor não configurado");

    expect(auditService.log).toHaveBeenCalledWith(
      { userId: "SYSTEM", organizationId: ORG_ID },
      expect.objectContaining({
        entity: "NotificationDelivery",
        entityId: "delivery-1",
        action: "notification_delivery.failed",
      })
    );
  });
});

describe("retryDelivery (test #11, #13)", () => {
  it("retries a FAILED delivery with attempts left", async () => {
    (findDeliveryById as Mock)
      .mockResolvedValueOnce(makeDelivery({ status: "FAILED", attempts: 1, maxAttempts: 3 }))
      .mockResolvedValueOnce(makeDelivery({ status: "PENDING", attempts: 1, maxAttempts: 3 }));

    const result = await retryDelivery("delivery-1", ORG_ID);

    expect(markRetryPending).toHaveBeenCalledWith("delivery-1", ORG_ID, "FAILED");
    expect(result.status).toBe("PENDING");
  });

  it("rejects retrying a non-FAILED delivery (e.g. DELIVERED — test #13)", async () => {
    (findDeliveryById as Mock).mockResolvedValue(makeDelivery({ status: "DELIVERED" }));
    await expect(retryDelivery("delivery-1", ORG_ID)).rejects.toThrow();
    expect(markRetryPending).not.toHaveBeenCalled();
  });

  it("rejects retrying a FAILED delivery that has exhausted maxAttempts", async () => {
    (findDeliveryById as Mock).mockResolvedValue(makeDelivery({ status: "FAILED", attempts: 3, maxAttempts: 3 }));
    await expect(retryDelivery("delivery-1", ORG_ID)).rejects.toThrow();
    expect(markRetryPending).not.toHaveBeenCalled();
  });
});

describe("cancelDelivery (test #12, #14)", () => {
  it("cancels a PENDING delivery", async () => {
    (findDeliveryById as Mock)
      .mockResolvedValueOnce(makeDelivery({ status: "PENDING" }))
      .mockResolvedValueOnce(makeDelivery({ status: "CANCELLED" }));

    const result = await cancelDelivery("delivery-1", ORG_ID);

    expect(cancelDeliveryRepo).toHaveBeenCalledWith("delivery-1", ORG_ID, "PENDING");
    expect(result.status).toBe("CANCELLED");
  });

  it("rejects cancelling a DELIVERED delivery (test #14)", async () => {
    (findDeliveryById as Mock).mockResolvedValue(makeDelivery({ status: "DELIVERED" }));
    await expect(cancelDelivery("delivery-1", ORG_ID)).rejects.toThrow();
    expect(cancelDeliveryRepo).not.toHaveBeenCalled();
  });
});

describe("runRetryJob (tests #19-23)", () => {
  it("retries every eligible delivery and reports scanned/retried", async () => {
    (findRetryEligibleDeliveries as Mock).mockResolvedValue([
      makeDelivery({ id: "d1" }),
      makeDelivery({ id: "d2" }),
    ]);
    (bulkRetryDeliveries as Mock).mockResolvedValue(2);

    const result = await runRetryJob(ORG_ID);

    expect(findRetryEligibleDeliveries).toHaveBeenCalledWith(ORG_ID, expect.any(Date));
    expect(bulkRetryDeliveries).toHaveBeenCalledWith(["d1", "d2"], expect.any(Date));
    expect(result).toEqual({ scanned: 2, retried: 2, skipped: 0, errors: 0 });
  });

  it("reports skipped when fewer rows were retried than scanned (lost a race)", async () => {
    (findRetryEligibleDeliveries as Mock).mockResolvedValue([makeDelivery({ id: "d1" }), makeDelivery({ id: "d2" })]);
    (bulkRetryDeliveries as Mock).mockResolvedValue(1);

    const result = await runRetryJob(ORG_ID);

    expect(result).toEqual({ scanned: 2, retried: 1, skipped: 1, errors: 0 });
  });

  it("does not retry anything when nothing is eligible (delivered/maxAttempts/future nextAttemptAt excluded upstream)", async () => {
    (findRetryEligibleDeliveries as Mock).mockResolvedValue([]);
    (bulkRetryDeliveries as Mock).mockResolvedValue(0);

    const result = await runRetryJob(ORG_ID);

    expect(result).toEqual({ scanned: 0, retried: 0, skipped: 0, errors: 0 });
  });

  it("scopes the scan by organizationId — tenant isolation (test #23)", async () => {
    (findRetryEligibleDeliveries as Mock).mockResolvedValue([]);
    (bulkRetryDeliveries as Mock).mockResolvedValue(0);

    await runRetryJob("org-a");

    expect(findRetryEligibleDeliveries).toHaveBeenCalledWith("org-a", expect.any(Date));
    expect(findRetryEligibleDeliveries).not.toHaveBeenCalledWith("org-b", expect.anything());
  });

  it("catches and reports an error instead of throwing", async () => {
    (findRetryEligibleDeliveries as Mock).mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await runRetryJob(ORG_ID);

    expect(result).toEqual({ scanned: 0, retried: 0, skipped: 0, errors: 1 });
  });
});
