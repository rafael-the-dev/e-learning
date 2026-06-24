import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn().mockResolvedValue(new Set()),
  createAbility: vi.fn().mockReturnValue({ can: vi.fn().mockReturnValue(true) }),
}));

vi.mock("@/modules/notifications/repositories/notification-delivery.repository", () => ({
  findDeliveryById: vi.fn(),
}));

vi.mock("@/modules/notifications/services/notification-delivery.service", () => ({
  retryDelivery: vi.fn(),
}));

vi.mock("@/modules/audit-logs/services/audit.service", () => ({
  auditService: { log: vi.fn() },
}));

import { createAbility } from "@/server/auth/rbac";
import { findDeliveryById } from "@/modules/notifications/repositories/notification-delivery.repository";
import { retryDelivery } from "@/modules/notifications/services/notification-delivery.service";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { RetryNotificationDeliveryCommand } from "../retry-notification-delivery.command";

const CTX = { userId: "user-1", organizationId: "org-1" };

function makeDelivery(overrides: Record<string, unknown> = {}) {
  return {
    id: "delivery-1",
    organizationId: "org-1",
    notificationId: "notif-1",
    channel: "EMAIL",
    recipient: "user@example.com",
    status: "FAILED",
    attempts: 1,
    maxAttempts: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("RetryNotificationDeliveryCommand — tenant isolation (test #21)", () => {
  it("rejects a delivery belonging to a different organization", async () => {
    (findDeliveryById as Mock).mockResolvedValue(null);

    const cmd = new RetryNotificationDeliveryCommand({ deliveryId: "delivery-from-other-org" }, CTX);
    await expect(cmd.validate()).rejects.toThrow();
    expect(findDeliveryById).toHaveBeenCalledWith("delivery-from-other-org", "org-1");
  });
});

describe("RetryNotificationDeliveryCommand — authorization (test #19)", () => {
  it("rejects when the actor lacks NOTIFICATIONS_RETRY_DELIVERY", async () => {
    (findDeliveryById as Mock).mockResolvedValue(makeDelivery());
    (createAbility as Mock).mockReturnValue({ can: vi.fn().mockReturnValue(false) });

    const cmd = new RetryNotificationDeliveryCommand({ deliveryId: "delivery-1" }, CTX);
    await cmd.validate();
    await expect(cmd.authorize()).rejects.toThrow();
    expect(retryDelivery).not.toHaveBeenCalled();
  });

  it("retries and audits when authorized", async () => {
    (findDeliveryById as Mock).mockResolvedValue(makeDelivery());
    (createAbility as Mock).mockReturnValue({ can: vi.fn().mockReturnValue(true) });
    (retryDelivery as Mock).mockResolvedValue(makeDelivery({ status: "PENDING" }));

    const cmd = new RetryNotificationDeliveryCommand({ deliveryId: "delivery-1" }, CTX);
    const result = await cmd.run();

    expect(result.status).toBe("PENDING");
    expect(retryDelivery).toHaveBeenCalledWith("delivery-1", "org-1");
    expect(auditService.log).toHaveBeenCalledWith(
      CTX,
      expect.objectContaining({ entity: "NotificationDelivery", action: "notification_delivery.retried" })
    );
  });
});
