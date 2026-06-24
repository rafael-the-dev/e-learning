import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/server/auth/context", () => ({
  requireOrganization: vi.fn().mockResolvedValue({ userId: "user-1", organizationId: "org-1" }),
  requirePermission: vi.fn(),
}));

vi.mock("@/modules/notifications/services/notification-delivery.service", () => ({
  listDeliveries: vi.fn(),
  getStatusSummary: vi.fn(),
}));

const runRetry = vi.fn();
const runCancel = vi.fn();

vi.mock("@/modules/notifications/commands/retry-notification-delivery.command", () => ({
  RetryNotificationDeliveryCommand: vi.fn().mockImplementation(() => ({ run: runRetry })),
}));

vi.mock("@/modules/notifications/commands/cancel-notification-delivery.command", () => ({
  CancelNotificationDeliveryCommand: vi.fn().mockImplementation(() => ({ run: runCancel })),
}));

import { requirePermission } from "@/server/auth/context";
import { listDeliveries, getStatusSummary } from "@/modules/notifications/services/notification-delivery.service";
import {
  listNotificationDeliveriesAction,
  getNotificationDeliverySummaryAction,
  retryNotificationDeliveryAction,
  cancelNotificationDeliveryAction,
} from "../notification-delivery.actions";

const AuthorizationError = class extends Error {};

beforeEach(() => vi.clearAllMocks());

describe("listNotificationDeliveriesAction — requires NOTIFICATIONS_VIEW_DELIVERIES (test #22)", () => {
  it("fails when the actor lacks the permission", async () => {
    (requirePermission as Mock).mockRejectedValue(new AuthorizationError("Sem permissão"));

    const result = await listNotificationDeliveriesAction({});

    expect(result.success).toBe(false);
    expect(listDeliveries).not.toHaveBeenCalled();
  });

  it("lists deliveries scoped to the org when authorized", async () => {
    (requirePermission as Mock).mockResolvedValue({ userId: "user-1", organizationId: "org-1" });
    (listDeliveries as Mock).mockResolvedValue({ data: [], total: 0 });

    const result = await listNotificationDeliveriesAction({ status: "FAILED" });

    expect(result.success).toBe(true);
    expect(listDeliveries).toHaveBeenCalledWith("org-1", { status: "FAILED" });
  });
});

describe("getNotificationDeliverySummaryAction", () => {
  it("requires NOTIFICATIONS_VIEW_DELIVERIES", async () => {
    (requirePermission as Mock).mockRejectedValue(new AuthorizationError("Sem permissão"));

    const result = await getNotificationDeliverySummaryAction();

    expect(result.success).toBe(false);
    expect(getStatusSummary).not.toHaveBeenCalled();
  });
});

describe("retryNotificationDeliveryAction (test #23)", () => {
  it("delegates to RetryNotificationDeliveryCommand", async () => {
    runRetry.mockResolvedValue({ id: "delivery-1", status: "PENDING" });

    const result = await retryNotificationDeliveryAction("delivery-1");

    expect(runRetry).toHaveBeenCalled();
    expect(result).toEqual({ success: true, data: { id: "delivery-1", status: "PENDING" } });
  });
});

describe("cancelNotificationDeliveryAction (test #24)", () => {
  it("delegates to CancelNotificationDeliveryCommand", async () => {
    runCancel.mockResolvedValue({ id: "delivery-1", status: "CANCELLED" });

    const result = await cancelNotificationDeliveryAction("delivery-1");

    expect(runCancel).toHaveBeenCalled();
    expect(result).toEqual({ success: true, data: { id: "delivery-1", status: "CANCELLED" } });
  });
});
