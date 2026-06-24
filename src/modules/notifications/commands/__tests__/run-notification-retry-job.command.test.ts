import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/modules/notifications/services/notification-delivery.service", () => ({
  runRetryJob: vi.fn(),
}));

vi.mock("@/modules/audit-logs/services/audit.service", () => ({
  auditService: { log: vi.fn().mockResolvedValue(undefined) },
}));

import { runRetryJob } from "@/modules/notifications/services/notification-delivery.service";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { RunNotificationRetryJobCommand } from "../run-notification-retry-job.command";

const CTX = { userId: "SYSTEM", organizationId: "org-1" };

beforeEach(() => vi.clearAllMocks());

describe("RunNotificationRetryJobCommand", () => {
  it("has no permission gate — system-internal, like RunNotificationDispatcherCommand", async () => {
    await expect(new RunNotificationRetryJobCommand(undefined, CTX).authorize()).resolves.toBeUndefined();
  });

  it("delegates to runRetryJob scoped to the caller's organization", async () => {
    (runRetryJob as Mock).mockResolvedValue({ scanned: 3, retried: 2, skipped: 1, errors: 0 });

    const result = await new RunNotificationRetryJobCommand(undefined, CTX).run();

    expect(runRetryJob).toHaveBeenCalledWith("org-1");
    expect(result).toEqual({ scanned: 3, retried: 2, skipped: 1, errors: 0 });
  });

  it("audits notification_delivery.retried when at least one delivery was retried", async () => {
    (runRetryJob as Mock).mockResolvedValue({ scanned: 2, retried: 2, skipped: 0, errors: 0 });

    await new RunNotificationRetryJobCommand(undefined, CTX).run();

    expect(auditService.log).toHaveBeenCalledWith(
      CTX,
      expect.objectContaining({ action: "notification_delivery.retried" })
    );
  });

  it("does not audit when nothing was retried", async () => {
    (runRetryJob as Mock).mockResolvedValue({ scanned: 0, retried: 0, skipped: 0, errors: 0 });

    await new RunNotificationRetryJobCommand(undefined, CTX).run();

    expect(auditService.log).not.toHaveBeenCalled();
  });
});
