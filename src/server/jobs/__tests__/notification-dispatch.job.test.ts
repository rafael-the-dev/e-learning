import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/server/db", () => ({ getDb: vi.fn() }));
vi.mock("@/modules/notifications/services/notification-dispatcher.service", () => ({
  dispatchPendingDeliveries: vi.fn(),
}));

import { getDb } from "@/server/db";
import { dispatchPendingDeliveries } from "@/modules/notifications/services/notification-dispatcher.service";
import { runNotificationDispatchJob } from "../notification-dispatch.job";

function makeDb(orgRows: { id: string }[] = [{ id: "org-1" }]) {
  return {
    organization: { findMany: vi.fn().mockResolvedValue(orgRows) },
    auditLog: { create: vi.fn().mockResolvedValue(undefined) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runNotificationDispatchJob — org scoping", () => {
  it("dispatches for every active organization when none is specified", async () => {
    const db = makeDb([{ id: "org-1" }, { id: "org-2" }]);
    (getDb as Mock).mockResolvedValue(db);
    (dispatchPendingDeliveries as Mock).mockResolvedValue({
      processed: 1,
      sent: 0,
      delivered: 1,
      failed: 0,
      providerNotConfigured: 0,
      errors: 0,
    });

    const result = await runNotificationDispatchJob();

    const callArgs = (db.organization.findMany as Mock).mock.calls[0][0];
    expect(callArgs.where).not.toHaveProperty("id");
    expect(dispatchPendingDeliveries).toHaveBeenCalledTimes(2);
    expect(result.processed).toBe(2);
    expect(result.delivered).toBe(2);
  });

  it("restricts the org query when organizationId is given (test #17)", async () => {
    const db = makeDb([{ id: "org-42" }]);
    (getDb as Mock).mockResolvedValue(db);
    (dispatchPendingDeliveries as Mock).mockResolvedValue({
      processed: 0,
      sent: 0,
      delivered: 0,
      failed: 0,
      providerNotConfigured: 0,
      errors: 0,
    });

    await runNotificationDispatchJob({ organizationId: "org-42" });

    expect(db.organization.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "org-42" }) })
    );
    expect(dispatchPendingDeliveries).toHaveBeenCalledWith("org-42", expect.any(Date), 100);
  });

  it("excludes CANCELLED/SUSPENDED organizations", async () => {
    const db = makeDb();
    (getDb as Mock).mockResolvedValue(db);
    (dispatchPendingDeliveries as Mock).mockResolvedValue({
      processed: 0,
      sent: 0,
      delivered: 0,
      failed: 0,
      providerNotConfigured: 0,
      errors: 0,
    });

    await runNotificationDispatchJob();

    expect(db.organization.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: { notIn: ["CANCELLED", "SUSPENDED"] } }) })
    );
  });
});

describe("runNotificationDispatchJob — limit (test #18)", () => {
  it("defaults to 100 when no limit is given", async () => {
    const db = makeDb([{ id: "org-1" }]);
    (getDb as Mock).mockResolvedValue(db);
    (dispatchPendingDeliveries as Mock).mockResolvedValue({
      processed: 0,
      sent: 0,
      delivered: 0,
      failed: 0,
      providerNotConfigured: 0,
      errors: 0,
    });

    await runNotificationDispatchJob();

    expect(dispatchPendingDeliveries).toHaveBeenCalledWith("org-1", expect.any(Date), 100);
  });

  it("caps the limit at 500 even when a larger value is requested", async () => {
    const db = makeDb([{ id: "org-1" }]);
    (getDb as Mock).mockResolvedValue(db);
    (dispatchPendingDeliveries as Mock).mockResolvedValue({
      processed: 0,
      sent: 0,
      delivered: 0,
      failed: 0,
      providerNotConfigured: 0,
      errors: 0,
    });

    await runNotificationDispatchJob({ limit: 10000 });

    expect(dispatchPendingDeliveries).toHaveBeenCalledWith("org-1", expect.any(Date), 500);
  });

  it("passes a custom limit through under the cap", async () => {
    const db = makeDb([{ id: "org-1" }]);
    (getDb as Mock).mockResolvedValue(db);
    (dispatchPendingDeliveries as Mock).mockResolvedValue({
      processed: 0,
      sent: 0,
      delivered: 0,
      failed: 0,
      providerNotConfigured: 0,
      errors: 0,
    });

    await runNotificationDispatchJob({ limit: 250 });

    expect(dispatchPendingDeliveries).toHaveBeenCalledWith("org-1", expect.any(Date), 250);
  });
});

describe("runNotificationDispatchJob — aggregation and error isolation", () => {
  it("sums processed/sent/delivered/providerNotConfigured/errors across organizations", async () => {
    const db = makeDb([{ id: "org-1" }, { id: "org-2" }]);
    (getDb as Mock).mockResolvedValue(db);
    (dispatchPendingDeliveries as Mock)
      .mockResolvedValueOnce({ processed: 2, sent: 1, delivered: 1, failed: 0, providerNotConfigured: 0, errors: 0 })
      .mockResolvedValueOnce({ processed: 3, sent: 0, delivered: 1, failed: 2, providerNotConfigured: 2, errors: 0 });

    const result = await runNotificationDispatchJob();

    expect(result).toMatchObject({ processed: 5, sent: 1, delivered: 2, failed: 2, providerNotConfigured: 2 });
    expect(result.startedAt).toBeInstanceOf(Date);
    expect(result.completedAt).toBeInstanceOf(Date);
  });

  it("sums failed and providerNotConfigured independently (hardening §7)", async () => {
    const db = makeDb([{ id: "org-1" }, { id: "org-2" }]);
    (getDb as Mock).mockResolvedValue(db);
    (dispatchPendingDeliveries as Mock)
      // org-1: a generic SMTP failure — counts toward failed only.
      .mockResolvedValueOnce({ processed: 1, sent: 0, delivered: 0, failed: 1, providerNotConfigured: 0, errors: 0 })
      // org-2: a provider-not-configured failure — counts toward both.
      .mockResolvedValueOnce({ processed: 1, sent: 0, delivered: 0, failed: 1, providerNotConfigured: 1, errors: 0 });

    const result = await runNotificationDispatchJob();

    expect(result.failed).toBe(2);
    expect(result.providerNotConfigured).toBe(1);
  });

  it("isolates a per-org failure — one org throwing does not abort the batch", async () => {
    const db = makeDb([{ id: "org-1" }, { id: "org-2" }]);
    (getDb as Mock).mockResolvedValue(db);
    (dispatchPendingDeliveries as Mock)
      .mockRejectedValueOnce(new Error("db hiccup"))
      .mockResolvedValueOnce({ processed: 1, sent: 0, delivered: 1, failed: 0, providerNotConfigured: 0, errors: 0 });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await runNotificationDispatchJob();

    expect(result.processed).toBe(1);
    expect(result.errors).toBe(1);
  });

  it("writes a notification_dispatcher.run audit row", async () => {
    const db = makeDb([{ id: "org-1" }]);
    (getDb as Mock).mockResolvedValue(db);
    (dispatchPendingDeliveries as Mock).mockResolvedValue({
      processed: 1,
      sent: 1,
      delivered: 0,
      failed: 0,
      providerNotConfigured: 0,
      errors: 0,
    });

    await runNotificationDispatchJob();

    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "notification_dispatcher.run" }) })
    );
  });
});
