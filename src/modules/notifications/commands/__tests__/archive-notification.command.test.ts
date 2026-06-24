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
  archive: vi.fn(),
}));

vi.mock("@/modules/audit-logs/services/audit.service", () => ({
  auditService: { log: vi.fn().mockResolvedValue(undefined) },
}));

import { createAbility } from "@/server/auth/rbac";
import { findNotificationById } from "@/modules/notifications/repositories/notification.repository";
import { archive } from "@/modules/notifications/services/notification.service";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { ArchiveNotificationCommand } from "../archive-notification.command";

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

describe("ArchiveNotificationCommand", () => {
  it("archives the caller's own notification and writes an audit log entry", async () => {
    (findNotificationById as Mock).mockResolvedValue(makeNotification());
    (createAbility as Mock).mockReturnValue({ can: vi.fn().mockReturnValue(true) });
    (archive as Mock).mockResolvedValue(makeNotification({ status: "ARCHIVED" }));

    const cmd = new ArchiveNotificationCommand({ notificationId: "notif-1" }, CTX);
    const result = await cmd.run();

    expect(result.status).toBe("ARCHIVED");
    expect(auditService.log).toHaveBeenCalledWith(
      CTX,
      expect.objectContaining({ action: "notification.archived", entity: "Notification", entityId: "notif-1" })
    );
  });

  it("rejects archiving another user's notification without NOTIFICATIONS_VIEW_ALL", async () => {
    (findNotificationById as Mock).mockResolvedValue(makeNotification({ recipientUserId: "someone-else" }));
    (createAbility as Mock).mockReturnValue({
      can: (perm: string) => perm === "notifications.archiveOwn",
    });

    const cmd = new ArchiveNotificationCommand({ notificationId: "notif-1" }, CTX);
    await cmd.validate();
    await expect(cmd.authorize()).rejects.toThrow();
    expect(archive).not.toHaveBeenCalled();
  });

  it("rejects a notification id that does not belong to the caller's organization", async () => {
    (findNotificationById as Mock).mockResolvedValue(null);
    const cmd = new ArchiveNotificationCommand({ notificationId: "cross-tenant-id" }, CTX);
    await expect(cmd.validate()).rejects.toThrow();
  });
});
