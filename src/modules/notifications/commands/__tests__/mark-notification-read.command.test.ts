import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn().mockResolvedValue(new Set()),
  createAbility: vi.fn().mockReturnValue({ can: vi.fn().mockReturnValue(true) }),
}));

vi.mock("@/modules/notifications/repositories/notification.repository", () => ({
  findNotificationById: vi.fn(),
}));

vi.mock("@/modules/notifications/services/notification.service", () => ({
  markAsRead: vi.fn(),
}));

import { createAbility } from "@/server/auth/rbac";
import { findNotificationById } from "@/modules/notifications/repositories/notification.repository";
import { markAsRead } from "@/modules/notifications/services/notification.service";
import { MarkNotificationReadCommand } from "../mark-notification-read.command";

const CTX = { userId: "user-1", organizationId: "org-1" };

function makeNotification(overrides: Record<string, unknown> = {}) {
  return {
    id: "notif-1",
    organizationId: "org-1",
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

beforeEach(() => vi.clearAllMocks());

describe("MarkNotificationReadCommand — tenant isolation", () => {
  it("rejects a notification belonging to a different organization (lookup scoped by org returns null)", async () => {
    (findNotificationById as Mock).mockResolvedValue(null);

    const cmd = new MarkNotificationReadCommand({ notificationId: "notif-from-other-org" }, CTX);
    await expect(cmd.validate()).rejects.toThrow();
    expect(findNotificationById).toHaveBeenCalledWith("notif-from-other-org", "org-1");
  });
});

describe("MarkNotificationReadCommand — ownership", () => {
  it("rejects marking another user's notification as read when the actor lacks NOTIFICATIONS_VIEW_ALL", async () => {
    (findNotificationById as Mock).mockResolvedValue(makeNotification({ recipientUserId: "someone-else" }));
    (createAbility as Mock).mockReturnValue({
      can: (perm: string) => perm === "notifications.markRead",
    });

    const cmd = new MarkNotificationReadCommand({ notificationId: "notif-1" }, CTX);
    await cmd.validate();
    await expect(cmd.authorize()).rejects.toThrow();
    expect(markAsRead).not.toHaveBeenCalled();
  });

  it("allows the recipient to mark their own notification as read", async () => {
    (findNotificationById as Mock).mockResolvedValue(makeNotification());
    (createAbility as Mock).mockReturnValue({ can: vi.fn().mockReturnValue(true) });
    (markAsRead as Mock).mockResolvedValue(makeNotification({ status: "READ" }));

    const cmd = new MarkNotificationReadCommand({ notificationId: "notif-1" }, CTX);
    const result = await cmd.run();

    expect(result.status).toBe("READ");
    expect(markAsRead).toHaveBeenCalledWith("org-1", "notif-1");
  });

  it("allows an admin with NOTIFICATIONS_VIEW_ALL to mark another user's notification as read", async () => {
    (findNotificationById as Mock).mockResolvedValue(makeNotification({ recipientUserId: "someone-else" }));
    (createAbility as Mock).mockReturnValue({ can: vi.fn().mockReturnValue(true) });
    (markAsRead as Mock).mockResolvedValue(makeNotification({ recipientUserId: "someone-else", status: "READ" }));

    const cmd = new MarkNotificationReadCommand({ notificationId: "notif-1" }, CTX);
    await expect(cmd.run()).resolves.toBeDefined();
  });
});
