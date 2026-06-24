import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

const { create, findMany, findFirst, count, updateMany, update } = vi.hoisted(() => ({
  create: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  count: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  getDb: vi.fn().mockResolvedValue({
    notification: { create, findMany, findFirst, count, updateMany, update },
  }),
}));

import {
  createNotification,
  findRecentDuplicate,
  findManyForUser,
  countUnread,
  findLatestForUser,
  markAsRead,
  markAllAsRead,
  archiveNotification,
} from "../notification.repository";

const ORG_ID = "org-1";
const USER_ID = "user-1";

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "notif-1",
    organizationId: ORG_ID,
    recipientUserId: USER_ID,
    type: "PAYMENT_RECEIVED",
    severity: "SUCCESS",
    title: "Pagamento confirmado",
    message: "O pagamento PAY-1 foi confirmado.",
    status: "UNREAD",
    actionUrl: "/payments/1",
    metadata: JSON.stringify({ referenceId: "pay-1" }),
    readAt: null,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("createNotification", () => {
  it("inserts a row scoped to the organization and serializes metadata", async () => {
    (create as Mock).mockResolvedValue(makeRow());

    const result = await createNotification(ORG_ID, {
      recipientUserId: USER_ID,
      type: "PAYMENT_RECEIVED",
      title: "Pagamento confirmado",
      message: "O pagamento PAY-1 foi confirmado.",
      metadata: { referenceId: "pay-1" },
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: ORG_ID,
        recipientUserId: USER_ID,
        severity: "INFO",
        metadata: JSON.stringify({ referenceId: "pay-1" }),
      }),
    });
    expect(result.metadata).toEqual({ referenceId: "pay-1" });
  });
});

describe("findRecentDuplicate", () => {
  it("returns true when a candidate within 24h has the same metadata.referenceId", async () => {
    (findMany as Mock).mockResolvedValue([{ metadata: JSON.stringify({ referenceId: "pay-1" }) }]);
    const result = await findRecentDuplicate(ORG_ID, USER_ID, "PAYMENT_RECEIVED", "pay-1");
    expect(result).toBe(true);
  });

  it("returns false when no candidate matches the referenceId", async () => {
    (findMany as Mock).mockResolvedValue([{ metadata: JSON.stringify({ referenceId: "pay-2" }) }]);
    const result = await findRecentDuplicate(ORG_ID, USER_ID, "PAYMENT_RECEIVED", "pay-1");
    expect(result).toBe(false);
  });
});

describe("findManyForUser — default visibility (archived hidden by default)", () => {
  it("excludes ARCHIVED notifications when no status filter is given", async () => {
    (findMany as Mock).mockResolvedValue([makeRow()]);
    (count as Mock).mockResolvedValue(1);

    await findManyForUser(ORG_ID, USER_ID, {});

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { not: "ARCHIVED" } }),
      })
    );
  });

  it("returns only ARCHIVED notifications when status=ARCHIVED", async () => {
    (findMany as Mock).mockResolvedValue([]);
    (count as Mock).mockResolvedValue(0);

    await findManyForUser(ORG_ID, USER_ID, { status: "ARCHIVED" });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "ARCHIVED" }) })
    );
  });

  it("includes every status when status=ALL", async () => {
    (findMany as Mock).mockResolvedValue([]);
    (count as Mock).mockResolvedValue(0);

    await findManyForUser(ORG_ID, USER_ID, { status: "ALL" });

    const callArgs = (findMany as Mock).mock.calls[0][0];
    expect(callArgs.where).not.toHaveProperty("status");
  });
});

describe("countUnread / findLatestForUser", () => {
  it("counts only UNREAD notifications for the recipient", async () => {
    (count as Mock).mockResolvedValue(3);
    const result = await countUnread(ORG_ID, USER_ID);
    expect(result).toBe(3);
    expect(count).toHaveBeenCalledWith({ where: { organizationId: ORG_ID, recipientUserId: USER_ID, status: "UNREAD" } });
  });

  it("fetches the latest N notifications excluding archived", async () => {
    (findMany as Mock).mockResolvedValue([makeRow()]);
    const result = await findLatestForUser(ORG_ID, USER_ID, 10);
    expect(result).toHaveLength(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: ORG_ID, recipientUserId: USER_ID, status: { not: "ARCHIVED" } },
        take: 10,
      })
    );
  });
});

describe("markAsRead / markAllAsRead / archiveNotification", () => {
  it("marks a single notification as read, never resurrecting an archived one", async () => {
    (updateMany as Mock).mockResolvedValue({ count: 1 });
    await markAsRead("notif-1", ORG_ID);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "notif-1", organizationId: ORG_ID, status: { not: "ARCHIVED" } },
      data: { status: "READ", readAt: expect.any(Date) },
    });
  });

  it("marks all UNREAD notifications as read and returns the affected count", async () => {
    (updateMany as Mock).mockResolvedValue({ count: 5 });
    const result = await markAllAsRead(ORG_ID, USER_ID);
    expect(result).toBe(5);
    expect(updateMany).toHaveBeenCalledWith({
      where: { organizationId: ORG_ID, recipientUserId: USER_ID, status: "UNREAD" },
      data: { status: "READ", readAt: expect.any(Date) },
    });
  });

  it("archives a notification", async () => {
    (update as Mock).mockResolvedValue(makeRow({ status: "ARCHIVED" }));
    await archiveNotification("notif-1", ORG_ID);
    expect(update).toHaveBeenCalledWith({
      where: { id: "notif-1", organizationId: ORG_ID },
      data: { status: "ARCHIVED", archivedAt: expect.any(Date) },
    });
  });
});
