import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn().mockResolvedValue(new Set()),
  createAbility: vi.fn().mockReturnValue({ can: vi.fn().mockReturnValue(true) }),
}));

vi.mock("@/modules/notifications/services/notification.service", () => ({
  markAllAsRead: vi.fn(),
}));

import { createAbility } from "@/server/auth/rbac";
import { markAllAsRead } from "@/modules/notifications/services/notification.service";
import { MarkAllNotificationsReadCommand } from "../mark-all-notifications-read.command";

const CTX = { userId: "user-1", organizationId: "org-1" };

beforeEach(() => vi.clearAllMocks());

describe("MarkAllNotificationsReadCommand", () => {
  it("marks every unread notification for the caller as read", async () => {
    (markAllAsRead as Mock).mockResolvedValue(3);
    const cmd = new MarkAllNotificationsReadCommand(undefined, CTX);
    const count = await cmd.run();
    expect(count).toBe(3);
    expect(markAllAsRead).toHaveBeenCalledWith("org-1", "user-1");
  });

  it("rejects when the actor lacks NOTIFICATIONS_MARK_READ", async () => {
    (createAbility as Mock).mockReturnValue({ can: vi.fn().mockReturnValue(false) });
    const cmd = new MarkAllNotificationsReadCommand(undefined, CTX);
    await expect(cmd.authorize()).rejects.toThrow();
  });
});
