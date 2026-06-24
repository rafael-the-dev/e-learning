import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/modules/notifications/services/notification-dispatcher.service", () => ({
  dispatchPendingDeliveries: vi.fn(),
}));

import { dispatchPendingDeliveries } from "@/modules/notifications/services/notification-dispatcher.service";
import { RunNotificationDispatcherCommand } from "../run-notification-dispatcher.command";

const CTX = { userId: "SYSTEM", organizationId: "org-1" };

beforeEach(() => vi.clearAllMocks());

describe("RunNotificationDispatcherCommand", () => {
  it("dispatches pending deliveries for the context's organization", async () => {
    (dispatchPendingDeliveries as Mock).mockResolvedValue({ processed: 2, sent: 0, delivered: 1, providerNotConfigured: 1, errors: 0 });

    const cmd = new RunNotificationDispatcherCommand(undefined, CTX);
    const result = await cmd.run();

    expect(dispatchPendingDeliveries).toHaveBeenCalledWith("org-1");
    expect(result).toEqual({ processed: 2, sent: 0, delivered: 1, providerNotConfigured: 1, errors: 0 });
  });
});
