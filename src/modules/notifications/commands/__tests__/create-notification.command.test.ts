import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("@/server/db", () => ({
  getDb: vi.fn().mockResolvedValue({ userOrganization: { findUnique } }),
}));

vi.mock("@/modules/notifications/services/notification.service", () => ({
  createNotification: vi.fn(),
}));

import { createNotification } from "@/modules/notifications/services/notification.service";
import { CreateNotificationCommand } from "../create-notification.command";

const CTX = { userId: "actor-1", organizationId: "org-1" };

beforeEach(() => vi.clearAllMocks());

describe("CreateNotificationCommand — tenant validation", () => {
  it("rejects a recipient that does not belong to the organization", async () => {
    (findUnique as Mock).mockResolvedValue(null);

    const cmd = new CreateNotificationCommand(
      { recipientUserId: "outsider", type: "GENERAL", title: "T", message: "M" },
      CTX
    );

    await expect(cmd.validate()).rejects.toThrow();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("creates the notification when the recipient belongs to the organization", async () => {
    (findUnique as Mock).mockResolvedValue({ userId: "user-1" });
    (createNotification as Mock).mockResolvedValue({ id: "notif-1" });

    const cmd = new CreateNotificationCommand(
      { recipientUserId: "user-1", type: "GENERAL", title: "T", message: "M" },
      CTX
    );

    const result = await cmd.run();
    expect(result).toEqual({ id: "notif-1" });
    expect(createNotification).toHaveBeenCalledWith("org-1", expect.objectContaining({ recipientUserId: "user-1" }));
  });
});
