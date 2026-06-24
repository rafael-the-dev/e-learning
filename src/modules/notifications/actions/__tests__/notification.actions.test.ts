import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/server/auth/context", () => ({
  requireOrganization: vi.fn().mockResolvedValue({ userId: "user-1", organizationId: "org-1" }),
}));

vi.mock("@/modules/notifications/services/notification.service", () => ({
  getUnreadCount: vi.fn(),
  getLatestForUser: vi.fn(),
  listForCurrentUser: vi.fn(),
}));

import {
  getUnreadCount,
  getLatestForUser,
  listForCurrentUser,
} from "@/modules/notifications/services/notification.service";
import { getNotificationBellDataAction } from "../notification.actions";

beforeEach(() => vi.clearAllMocks());

describe("getNotificationBellDataAction", () => {
  it("fetches only the unread count and the latest 10 notifications — never the full list", async () => {
    (getUnreadCount as Mock).mockResolvedValue(3);
    (getLatestForUser as Mock).mockResolvedValue([{ id: "notif-1" }]);

    const result = await getNotificationBellDataAction();

    expect(result).toEqual({ success: true, data: { unreadCount: 3, latest: [{ id: "notif-1" }] } });
    expect(getUnreadCount).toHaveBeenCalledWith("org-1", "user-1");
    expect(getLatestForUser).toHaveBeenCalledWith("org-1", "user-1", 10);
    expect(listForCurrentUser).not.toHaveBeenCalled();
  });
});
