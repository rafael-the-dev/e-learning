import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/modules/notifications/repositories/notification.repository", () => ({
  createNotification: vi.fn(),
  findRecentDuplicate: vi.fn(),
  findNotificationById: vi.fn(),
  countUnread: vi.fn(),
  findLatestForUser: vi.fn(),
  findManyForUser: vi.fn(),
  markAsRead: vi.fn(),
  markAllAsRead: vi.fn(),
  archiveNotification: vi.fn(),
}));

vi.mock("@/modules/notifications/services/notification-rule-engine.service", () => ({
  resolveNotificationConfig: vi.fn(),
}));

vi.mock("@/modules/notifications/services/notification-delivery.service", () => ({
  createDeliveriesForNotification: vi.fn().mockResolvedValue([]),
}));

import {
  createNotification as createNotificationRow,
  findRecentDuplicate,
  findNotificationById,
  countUnread,
  findLatestForUser as findLatestForUserRepo,
  findManyForUser,
  markAsRead as markAsReadRepo,
  markAllAsRead as markAllAsReadRepo,
  archiveNotification as archiveNotificationRepo,
} from "@/modules/notifications/repositories/notification.repository";
import { resolveNotificationConfig } from "@/modules/notifications/services/notification-rule-engine.service";
import { createDeliveriesForNotification } from "@/modules/notifications/services/notification-delivery.service";
import {
  createNotification,
  createNotificationFromEvent,
  createManyNotifications,
  createManyNotificationsFromEvent,
  getUnreadCount,
  getLatestForUser,
  listForCurrentUser,
  markAsRead,
  markAllAsRead,
  archive,
} from "../notification.service";

const ORG_ID = "org-1";
const USER_ID = "user-1";

function makeNotification(overrides: Record<string, unknown> = {}) {
  return {
    id: "notif-1",
    organizationId: ORG_ID,
    recipientUserId: USER_ID,
    type: "PAYMENT_RECEIVED",
    severity: "INFO",
    title: "Título",
    message: "Mensagem",
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

beforeEach(() => vi.clearAllMocks());

describe("createNotification — dedupe", () => {
  it("creates a notification when there is no recent duplicate", async () => {
    (findRecentDuplicate as Mock).mockResolvedValue(false);
    (createNotificationRow as Mock).mockResolvedValue(makeNotification());

    const input = { recipientUserId: USER_ID, type: "PAYMENT_RECEIVED", title: "T", message: "M", metadata: { referenceId: "pay-1" } };
    const result = await createNotification(ORG_ID, input);

    expect(result).not.toBeNull();
    expect(createNotificationRow).toHaveBeenCalledWith(ORG_ID, input);
    expect(createDeliveriesForNotification).toHaveBeenCalledWith(ORG_ID, result, ["IN_APP"]);
  });

  it("skips creation when a duplicate exists within the dedupe window", async () => {
    (findRecentDuplicate as Mock).mockResolvedValue(true);

    const result = await createNotification(ORG_ID, {
      recipientUserId: USER_ID,
      type: "PAYMENT_RECEIVED",
      title: "T",
      message: "M",
      metadata: { referenceId: "pay-1" },
    });

    expect(result).toBeNull();
    expect(createNotificationRow).not.toHaveBeenCalled();
    expect(createDeliveriesForNotification).not.toHaveBeenCalled();
  });

  it("does not run a dedupe check when no referenceId is provided", async () => {
    (createNotificationRow as Mock).mockResolvedValue(makeNotification());

    await createNotification(ORG_ID, { recipientUserId: USER_ID, type: "GENERAL", title: "T", message: "M" });

    expect(findRecentDuplicate).not.toHaveBeenCalled();
    expect(createNotificationRow).toHaveBeenCalled();
  });
});

describe("createNotification — delivery-creation failure isolation (H1)", () => {
  it("still returns the committed notification when createDeliveriesForNotification throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const notification = makeNotification();
    (createNotificationRow as Mock).mockResolvedValue(notification);
    (createDeliveriesForNotification as Mock).mockRejectedValue(new Error("db unavailable"));

    const result = await createNotification(ORG_ID, {
      recipientUserId: USER_ID,
      type: "GENERAL",
      title: "T",
      message: "M",
    });

    expect(result).toEqual(notification);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining(notification.id),
      expect.any(Error)
    );
  });
});

describe("createManyNotifications", () => {
  it("creates one notification per input and skips deduped ones", async () => {
    (findRecentDuplicate as Mock)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    (createNotificationRow as Mock).mockResolvedValue(makeNotification());

    const result = await createManyNotifications(ORG_ID, [
      { recipientUserId: "u-1", type: "T", title: "T", message: "M", metadata: { referenceId: "ref-1" } },
      { recipientUserId: "u-2", type: "T", title: "T", message: "M", metadata: { referenceId: "ref-1" } },
    ]);

    expect(result).toHaveLength(1);
    expect(createNotificationRow).toHaveBeenCalledTimes(1);
  });

  it("(H1) continues to remaining recipients when one delivery-creation call fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    (createNotificationRow as Mock)
      .mockResolvedValueOnce(makeNotification({ id: "notif-1" }))
      .mockResolvedValueOnce(makeNotification({ id: "notif-2" }));
    (createDeliveriesForNotification as Mock)
      .mockRejectedValueOnce(new Error("db unavailable"))
      .mockResolvedValueOnce([]);

    const result = await createManyNotifications(ORG_ID, [
      { recipientUserId: "u-1", type: "T", title: "T", message: "M" },
      { recipientUserId: "u-2", type: "T", title: "T", message: "M" },
    ]);

    expect(result).toHaveLength(2);
    expect(createNotificationRow).toHaveBeenCalledTimes(2);
  });
});

describe("createNotificationFromEvent", () => {
  function makeResolvedConfig(overrides: Record<string, unknown> = {}) {
    return {
      rule: { id: "rule-1", dedupeWindowMinutes: 1440, channels: ["IN_APP"], ...((overrides.rule as object) ?? {}) },
      catalogEntry: { defaultSeverity: "SUCCESS", defaultActionUrlPattern: "/payments/{{paymentId}}" },
      titleTemplate: "Pagamento confirmado",
      bodyTemplate: "O pagamento {{paymentNumber}} foi confirmado.",
      templateSource: "CATALOG_DEFAULT",
      ...overrides,
    };
  }

  it("returns null when the rule engine resolves no config (test #19 — disabled rule prevents notification)", async () => {
    (resolveNotificationConfig as Mock).mockResolvedValue(null);

    const result = await createNotificationFromEvent(ORG_ID, {
      eventType: "payment.confirmed",
      recipientUserId: USER_ID,
      variables: { paymentId: "pay-1", paymentNumber: "PAY-001" },
      referenceId: "pay-1",
    });

    expect(result).toBeNull();
    expect(createNotificationRow).not.toHaveBeenCalled();
    expect(createDeliveriesForNotification).not.toHaveBeenCalled();
  });

  it("renders the resolved template, creates the notification, and creates deliveries for the rule's channels", async () => {
    (resolveNotificationConfig as Mock).mockResolvedValue(
      makeResolvedConfig({ rule: { id: "rule-1", dedupeWindowMinutes: 1440, channels: ["IN_APP", "EMAIL"] } })
    );
    (findRecentDuplicate as Mock).mockResolvedValue(false);
    const notification = makeNotification();
    (createNotificationRow as Mock).mockResolvedValue(notification);

    await createNotificationFromEvent(ORG_ID, {
      eventType: "payment.confirmed",
      recipientUserId: USER_ID,
      variables: { paymentId: "pay-1", paymentNumber: "PAY-001" },
      referenceId: "pay-1",
    });

    expect(createNotificationRow).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({
        title: "Pagamento confirmado",
        message: "O pagamento PAY-001 foi confirmado.",
        actionUrl: "/payments/pay-1",
        severity: "SUCCESS",
      })
    );
    expect(createDeliveriesForNotification).toHaveBeenCalledWith(ORG_ID, notification, ["IN_APP", "EMAIL"]);
  });

  it("passes the rule's dedupeWindowMinutes to findRecentDuplicate, not the hardcoded 24h default (test #15)", async () => {
    (resolveNotificationConfig as Mock).mockResolvedValue(
      makeResolvedConfig({ rule: { id: "rule-1", dedupeWindowMinutes: 60 } })
    );
    (findRecentDuplicate as Mock).mockResolvedValue(false);
    (createNotificationRow as Mock).mockResolvedValue(makeNotification());

    await createNotificationFromEvent(ORG_ID, {
      eventType: "payment.confirmed",
      recipientUserId: USER_ID,
      variables: { paymentId: "pay-1", paymentNumber: "PAY-001" },
      referenceId: "pay-1",
    });

    expect(findRecentDuplicate).toHaveBeenCalledWith(ORG_ID, USER_ID, "payment.confirmed", "pay-1", 60);
  });

  it("skips creation when a duplicate exists within the rule's dedupe window", async () => {
    (resolveNotificationConfig as Mock).mockResolvedValue(makeResolvedConfig());
    (findRecentDuplicate as Mock).mockResolvedValue(true);

    const result = await createNotificationFromEvent(ORG_ID, {
      eventType: "payment.confirmed",
      recipientUserId: USER_ID,
      variables: { paymentId: "pay-1", paymentNumber: "PAY-001" },
      referenceId: "pay-1",
    });

    expect(result).toBeNull();
    expect(createNotificationRow).not.toHaveBeenCalled();
  });

  it("(H1) still returns the committed notification when createDeliveriesForNotification throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    (resolveNotificationConfig as Mock).mockResolvedValue(makeResolvedConfig());
    (findRecentDuplicate as Mock).mockResolvedValue(false);
    const notification = makeNotification();
    (createNotificationRow as Mock).mockResolvedValue(notification);
    (createDeliveriesForNotification as Mock).mockRejectedValue(new Error("db unavailable"));

    const result = await createNotificationFromEvent(ORG_ID, {
      eventType: "payment.confirmed",
      recipientUserId: USER_ID,
      variables: { paymentId: "pay-1", paymentNumber: "PAY-001" },
      referenceId: "pay-1",
    });

    expect(result).toEqual(notification);
  });
});

describe("createManyNotificationsFromEvent — fan-out continuation (H1)", () => {
  it("continues to remaining recipients when one delivery-creation call fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    (resolveNotificationConfig as Mock).mockResolvedValue(
      makeResolvedConfigStandalone()
    );
    (findRecentDuplicate as Mock).mockResolvedValue(false);
    (createNotificationRow as Mock)
      .mockResolvedValueOnce(makeNotification({ id: "notif-1" }))
      .mockResolvedValueOnce(makeNotification({ id: "notif-2" }));
    (createDeliveriesForNotification as Mock)
      .mockRejectedValueOnce(new Error("db unavailable"))
      .mockResolvedValueOnce([]);

    const result = await createManyNotificationsFromEvent(ORG_ID, [
      { eventType: "payment.confirmed", recipientUserId: "u-1", variables: {} },
      { eventType: "payment.confirmed", recipientUserId: "u-2", variables: {} },
    ]);

    expect(result).toHaveLength(2);
    expect(createNotificationRow).toHaveBeenCalledTimes(2);
  });
});

function makeResolvedConfigStandalone(overrides: Record<string, unknown> = {}) {
  return {
    rule: { id: "rule-1", dedupeWindowMinutes: 1440, channels: ["IN_APP"] },
    catalogEntry: { defaultSeverity: "SUCCESS", defaultActionUrlPattern: undefined },
    titleTemplate: "Pagamento confirmado",
    bodyTemplate: "O pagamento {{paymentNumber}} foi confirmado.",
    templateSource: "CATALOG_DEFAULT",
    ...overrides,
  };
}

describe("getUnreadCount / getLatestForUser", () => {
  it("delegates to the repository", async () => {
    (countUnread as Mock).mockResolvedValue(4);
    expect(await getUnreadCount(ORG_ID, USER_ID)).toBe(4);

    (findLatestForUserRepo as Mock).mockResolvedValue([makeNotification()]);
    const latest = await getLatestForUser(ORG_ID, USER_ID, 10);
    expect(latest).toHaveLength(1);
    expect(findLatestForUserRepo).toHaveBeenCalledWith(ORG_ID, USER_ID, 10);
  });
});

describe("listForCurrentUser", () => {
  it("builds pagination metadata from the repository result", async () => {
    (findManyForUser as Mock).mockResolvedValue({ data: [makeNotification()], total: 1 });

    const result = await listForCurrentUser(ORG_ID, USER_ID, {});

    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.data).toHaveLength(1);
  });
});

describe("markAsRead", () => {
  it("throws NotFoundError when the notification does not belong to the organization", async () => {
    (findNotificationById as Mock).mockResolvedValue(null);
    await expect(markAsRead(ORG_ID, "missing")).rejects.toThrow();
  });

  it("marks an UNREAD notification as read", async () => {
    (findNotificationById as Mock)
      .mockResolvedValueOnce(makeNotification({ status: "UNREAD" }))
      .mockResolvedValueOnce(makeNotification({ status: "READ" }));

    const result = await markAsRead(ORG_ID, "notif-1");

    expect(markAsReadRepo).toHaveBeenCalledWith("notif-1", ORG_ID);
    expect(result.status).toBe("READ");
  });

  it("does not reopen an ARCHIVED notification", async () => {
    (findNotificationById as Mock).mockResolvedValue(makeNotification({ status: "ARCHIVED" }));

    await markAsRead(ORG_ID, "notif-1");

    expect(markAsReadRepo).not.toHaveBeenCalled();
  });
});

describe("markAllAsRead", () => {
  it("delegates to the repository and returns the affected count", async () => {
    (markAllAsReadRepo as Mock).mockResolvedValue(7);
    expect(await markAllAsRead(ORG_ID, USER_ID)).toBe(7);
    expect(markAllAsReadRepo).toHaveBeenCalledWith(ORG_ID, USER_ID);
  });
});

describe("archive", () => {
  it("throws NotFoundError when the notification is not found", async () => {
    (findNotificationById as Mock).mockResolvedValue(null);
    await expect(archive(ORG_ID, "missing")).rejects.toThrow();
  });

  it("archives an existing notification", async () => {
    (findNotificationById as Mock)
      .mockResolvedValueOnce(makeNotification({ status: "UNREAD" }))
      .mockResolvedValueOnce(makeNotification({ status: "ARCHIVED" }));

    const result = await archive(ORG_ID, "notif-1");

    expect(archiveNotificationRepo).toHaveBeenCalledWith("notif-1", ORG_ID);
    expect(result.status).toBe("ARCHIVED");
  });
});
