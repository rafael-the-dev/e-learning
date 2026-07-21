import { describe, it, expect, vi, beforeEach } from "vitest";
import { getCutoffDate, resolveTimezone, runDailyBillingJob } from "../daily-billing.job";

// =============================================================================
// Mock infrastructure
// =============================================================================

vi.mock("@/server/db", () => ({ getDb: vi.fn() }));
vi.mock("@/server/events/event-publisher", () => ({
  eventPublisher: { publish: vi.fn().mockResolvedValue(undefined) },
}));

import { getDb } from "@/server/db";
import { eventPublisher } from "@/server/events/event-publisher";

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeOrg(overrides?: {
  id?: string;
  timezone?: string;
  enable?: boolean;
  graceDays?: number;
  markFromInstallment?: boolean;
  notifyOnOverdue?: boolean;
  overdueNotificationDelayDays?: number;
}) {
  return {
    id: overrides?.id ?? "org-1",
    timezone: overrides?.timezone ?? "UTC",
    settings: {
      enableAutomaticOverdueProcessing: overrides?.enable ?? true,
      overdueGraceDays: overrides?.graceDays ?? 0,
      markInvoiceOverdueWhenAnyInstallmentOverdue: overrides?.markFromInstallment ?? true,
      notifyOnOverdue: overrides?.notifyOnOverdue ?? true,
      overdueNotificationDelayDays: overrides?.overdueNotificationDelayDays ?? 0,
    },
  };
}

function makeDb(overrides?: {
  orgRows?: object[];
  installmentUpdateCount?: number;
  invoiceUpdateCounts?: number[];
  installmentFindRows?: { invoiceId: string }[];
  affectedStudentRows?: { studentId: string | null }[];
}) {
  const invoiceCounts = overrides?.invoiceUpdateCounts ?? [0, 0];
  let invCallIndex = 0;

  return {
    organization: {
      findMany: vi.fn().mockResolvedValue(overrides?.orgRows ?? [makeOrg()]),
    },
    installment: {
      updateMany: vi
        .fn()
        .mockResolvedValue({ count: overrides?.installmentUpdateCount ?? 0 }),
      findMany: vi
        .fn()
        .mockResolvedValue(overrides?.installmentFindRows ?? []),
    },
    invoice: {
      updateMany: vi.fn().mockImplementation(() => {
        const count = invoiceCounts[invCallIndex] ?? 0;
        invCallIndex++;
        return Promise.resolve({ count });
      }),
      // F-H3: distinct students whose invoices were marked overdue this run.
      findMany: vi.fn().mockResolvedValue(overrides?.affectedStudentRows ?? []),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue(undefined),
    },
  };
}

// =============================================================================
// resolveTimezone — pure unit tests
// =============================================================================

describe("resolveTimezone", () => {
  it("returns the timezone unchanged when valid", () => {
    expect(resolveTimezone("Africa/Maputo")).toEqual({ timezone: "Africa/Maputo" });
    expect(resolveTimezone("UTC")).toEqual({ timezone: "UTC" });
    expect(resolveTimezone("Europe/Lisbon")).toEqual({ timezone: "Europe/Lisbon" });
  });

  it("returns UTC and a warning for an invalid timezone", () => {
    const result = resolveTimezone("Not/ATimezone");
    expect(result.timezone).toBe("UTC");
    expect(result.warning).toContain("Not/ATimezone");
    expect(result.warning).toBeDefined();
  });

  it("returns UTC when rawTimezone is null", () => {
    expect(resolveTimezone(null)).toEqual({ timezone: "UTC" });
  });

  it("returns UTC when rawTimezone is undefined", () => {
    expect(resolveTimezone(undefined)).toEqual({ timezone: "UTC" });
  });
});

// =============================================================================
// getCutoffDate — pure unit tests (no DB)
// =============================================================================

describe("getCutoffDate", () => {
  it("with graceDays=0 returns start of today (UTC)", () => {
    const cutoff = getCutoffDate("UTC", 0);
    const now = new Date();
    const todayMidnight = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );
    expect(cutoff.getTime()).toBe(todayMidnight.getTime());
  });

  it("with graceDays=5 returns 5 days before today", () => {
    const cutoff = getCutoffDate("UTC", 5);
    const now = new Date();
    const todayMidnight = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );
    const expected = new Date(todayMidnight.getTime() - 5 * 24 * 60 * 60 * 1000);
    expect(cutoff.getTime()).toBe(expected.getTime());
  });

  it("falls back to UTC when timezone is invalid (safety net)", () => {
    const cutoff = getCutoffDate("Not/ATimezone", 0);
    const now = new Date();
    const todayMidnight = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );
    expect(cutoff.getTime()).toBe(todayMidnight.getTime());
  });

  it("a dueDate equal to yesterday is before the cutoff (graceDays=0)", () => {
    const cutoff = getCutoffDate("UTC", 0);
    const yesterday = new Date(cutoff.getTime() - 24 * 60 * 60 * 1000);
    expect(yesterday < cutoff).toBe(true);
  });

  it("a dueDate 3 days ago is NOT past the cutoff when graceDays=5", () => {
    const cutoff = getCutoffDate("UTC", 5);
    const now = new Date();
    const todayMidnight = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );
    const threeDaysAgo = new Date(todayMidnight.getTime() - 3 * 24 * 60 * 60 * 1000);
    expect(threeDaysAgo < cutoff).toBe(false);
  });
});

// =============================================================================
// runDailyBillingJob — disabled policy
// =============================================================================

describe("runDailyBillingJob — disabled policy", () => {
  beforeEach(() => vi.clearAllMocks());

  it("skips organization when enableAutomaticOverdueProcessing=false (test 15)", async () => {
    const db = makeDb({ orgRows: [makeOrg({ enable: false })] });
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);

    const result = await runDailyBillingJob();

    expect(result.organizationsSkipped).toBe(1);
    expect(result.organizationsProcessed).toBe(0);
    expect(db.installment.updateMany).not.toHaveBeenCalled();
    expect(db.invoice.updateMany).not.toHaveBeenCalled();
  });
});

// =============================================================================
// runDailyBillingJob — SUSPENDED / CANCELLED org exclusion
// =============================================================================

describe("runDailyBillingJob — organization eligibility filter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("queries organizations with status NOT IN [CANCELLED, SUSPENDED]", async () => {
    const db = makeDb();
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);

    await runDailyBillingJob();

    const orgQuery = (db.organization.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(orgQuery.where.status).toEqual({ notIn: ["CANCELLED", "SUSPENDED"] });
  });

  it("applies deletedAt=null filter", async () => {
    const db = makeDb();
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);

    await runDailyBillingJob();

    const orgQuery = (db.organization.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(orgQuery.where.deletedAt).toBeNull();
  });
});

// =============================================================================
// runDailyBillingJob — single-org filter (organizationId option)
// =============================================================================

describe("runDailyBillingJob — organizationId option", () => {
  beforeEach(() => vi.clearAllMocks());

  it("filters to a single org when organizationId is provided", async () => {
    const db = makeDb({ orgRows: [makeOrg({ id: "org-X" })] });
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);

    await runDailyBillingJob({ organizationId: "org-X" });

    const orgQuery = (db.organization.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(orgQuery.where.id).toBe("org-X");
  });

  it("does not add id filter when organizationId is not provided", async () => {
    const db = makeDb();
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);

    await runDailyBillingJob();

    const orgQuery = (db.organization.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(orgQuery.where.id).toBeUndefined();
  });
});

// =============================================================================
// runDailyBillingJob — installment overdue marking
// =============================================================================

describe("runDailyBillingJob — installment overdue marking", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls installment.updateMany with status IN [PENDING, PARTIALLY_PAID] and balanceAmount > 0 (test 1 & 2)", async () => {
    const db = makeDb({ installmentUpdateCount: 3 });
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);

    const result = await runDailyBillingJob();

    const call = (db.installment.updateMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.where.status).toEqual({ in: ["PENDING", "PARTIALLY_PAID"] });
    expect(call.where.balanceAmount).toEqual({ gt: 0 });
    expect(call.data.status).toBe("OVERDUE");
    expect(result.totalInstallmentsMarkedOverdue).toBe(3);
  });

  it("does NOT include PAID or OVERDUE in the installment update filter (test 3 & 7)", async () => {
    const db = makeDb();
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);
    await runDailyBillingJob();

    const call = (db.installment.updateMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const allowedStatuses: string[] = call.where.status.in;
    expect(allowedStatuses).not.toContain("PAID");
    expect(allowedStatuses).not.toContain("OVERDUE");
  });

  it("does not mutate paidAmount or balanceAmount in installment updateMany", async () => {
    const db = makeDb({ installmentUpdateCount: 3 });
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);
    await runDailyBillingJob();

    const call = (db.installment.updateMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.data.paidAmount).toBeUndefined();
    expect(call.data.balanceAmount).toBeUndefined();
    expect(call.data.status).toBe("OVERDUE");
  });

  it("scopes installment update by organizationId (test 14 — tenant isolation)", async () => {
    const orgs = [makeOrg({ id: "org-A" }), makeOrg({ id: "org-B" })];
    const db = makeDb({ orgRows: orgs });
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);
    await runDailyBillingJob();

    const calls = (db.installment.updateMany as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][0].where.organizationId).toBe("org-A");
    expect(calls[1][0].where.organizationId).toBe("org-B");
  });
});

// =============================================================================
// runDailyBillingJob — invoice direct overdue marking
// =============================================================================

describe("runDailyBillingJob — invoice direct overdue marking", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls invoice.updateMany with status IN [PENDING, PARTIALLY_PAID] and balanceAmount > 0 (test 1 & 2)", async () => {
    const db = makeDb({ invoiceUpdateCounts: [4, 0] });
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);
    const result = await runDailyBillingJob();

    const firstCall = (db.invoice.updateMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(firstCall.where.status).toEqual({ in: ["PENDING", "PARTIALLY_PAID"] });
    expect(firstCall.where.balanceAmount).toEqual({ gt: 0 });
    expect(firstCall.where.deletedAt).toBeNull();
    expect(firstCall.data.status).toBe("OVERDUE");
    expect(result.totalInvoicesMarkedOverdue).toBe(4);
  });

  it("only marks invoices without a payment plan in direct update (paymentPlan: null)", async () => {
    const db = makeDb();
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);
    await runDailyBillingJob();

    const firstCall = (db.invoice.updateMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(firstCall.where.paymentPlan).toBeNull();
  });

  it("does NOT include PAID or CANCELLED in the invoice update filter (test 3 & 4)", async () => {
    const db = makeDb();
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);
    await runDailyBillingJob();

    const firstCall = (db.invoice.updateMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const statuses: string[] = firstCall.where.status.in;
    expect(statuses).not.toContain("PAID");
    expect(statuses).not.toContain("CANCELLED");
  });

  it("excludes soft-deleted invoices (deletedAt: null)", async () => {
    const db = makeDb();
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);
    await runDailyBillingJob();

    const firstCall = (db.invoice.updateMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(firstCall.where.deletedAt).toBeNull();
  });

  it("does not mutate paidAmount or balanceAmount in invoice updateMany", async () => {
    const db = makeDb({ invoiceUpdateCounts: [2, 0] });
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);
    await runDailyBillingJob();

    const firstCall = (db.invoice.updateMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(firstCall.data.paidAmount).toBeUndefined();
    expect(firstCall.data.balanceAmount).toBeUndefined();
    expect(firstCall.data.status).toBe("OVERDUE");
  });
});

// =============================================================================
// runDailyBillingJob — invoice overdue via installment policy
// =============================================================================

describe("runDailyBillingJob — invoice overdue via installment policy", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches overdue installment invoiceIds and calls invoice.updateMany when policy=true (test 10)", async () => {
    const db = makeDb({
      installmentFindRows: [{ invoiceId: "inv-1" }, { invoiceId: "inv-2" }],
      invoiceUpdateCounts: [0, 2],
    });
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);

    const result = await runDailyBillingJob();

    expect(db.installment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "OVERDUE" }),
        select: { invoiceId: true },
        distinct: ["invoiceId"],
      })
    );

    const secondInvoiceCall = (db.invoice.updateMany as ReturnType<typeof vi.fn>).mock.calls[1][0];
    expect(secondInvoiceCall.where.id).toEqual({ in: ["inv-1", "inv-2"] });
    expect(secondInvoiceCall.data.status).toBe("OVERDUE");
    expect(result.totalInvoicesMarkedOverdue).toBe(2);
  });

  it("does NOT call installment.findMany or second invoice.updateMany when policy=false (test 11)", async () => {
    const db = makeDb({ orgRows: [makeOrg({ markFromInstallment: false })] });
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);
    await runDailyBillingJob();

    expect(db.installment.findMany).not.toHaveBeenCalled();
    expect(db.invoice.updateMany).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// Grace days (test 9)
// =============================================================================

describe("runDailyBillingJob — grace days respected", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes a cutoff date shifted by overdueGraceDays into the installment where clause", async () => {
    const db = makeDb({ orgRows: [makeOrg({ graceDays: 5 })] });
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);
    await runDailyBillingJob();

    const call = (db.installment.updateMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const cutoff: Date = call.where.dueDate.lt;

    const now = new Date();
    const todayMidnight = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );
    const expectedCutoff = new Date(todayMidnight.getTime() - 5 * 24 * 60 * 60 * 1000);
    expect(cutoff.getTime()).toBe(expectedCutoff.getTime());
  });
});

// =============================================================================
// notifyOnOverdue policy
// =============================================================================

describe("runDailyBillingJob — notifyOnOverdue policy", () => {
  beforeEach(() => vi.clearAllMocks());

  it("publishes BILLING_OVERDUE_DETECTED when notifyOnOverdue=true and items were marked", async () => {
    const db = makeDb({ installmentUpdateCount: 2 });
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);

    await runDailyBillingJob();

    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
    const call = (eventPublisher.publish as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.eventType).toBe("billing.overdue_detected");
  });

  it("does NOT publish event when notifyOnOverdue=false even if items were marked", async () => {
    const db = makeDb({
      orgRows: [makeOrg({ notifyOnOverdue: false })],
      installmentUpdateCount: 5,
    });
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);

    await runDailyBillingJob();

    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });

  it("does NOT publish event when nothing was marked overdue (nothing to notify)", async () => {
    const db = makeDb({ installmentUpdateCount: 0, invoiceUpdateCounts: [0, 0] });
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);

    await runDailyBillingJob();

    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });

  it("includes overdueNotificationDelayDays in the event payload", async () => {
    const db = makeDb({
      orgRows: [makeOrg({ notifyOnOverdue: true, overdueNotificationDelayDays: 3 })],
      installmentUpdateCount: 1,
    });
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);

    await runDailyBillingJob();

    const call = (eventPublisher.publish as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.payload.overdueNotificationDelayDays).toBe(3);
  });

  it("F-H3: emits INVOICE_OVERDUE per newly-overdue student (risk), independent of notifyOnOverdue", async () => {
    const db = makeDb({
      orgRows: [makeOrg({ notifyOnOverdue: false })], // notifications off — risk events still fire
      invoiceUpdateCounts: [2, 0],
      affectedStudentRows: [{ studentId: "s1" }, { studentId: "s2" }, { studentId: null }],
    });
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);

    await runDailyBillingJob();

    const calls = (eventPublisher.publish as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    const overdue = calls.filter((c) => c.eventType === "invoice.overdue");
    expect(overdue).toHaveLength(2); // the null studentId is filtered out
    expect(overdue.map((c) => c.payload.studentId).sort()).toEqual(["s1", "s2"]);
    expect(overdue[0].payload.studentId).toBeTruthy();
    // notifyOnOverdue=false → the aggregate notification event is NOT published...
    expect(calls.some((c) => c.eventType === "billing.overdue_detected")).toBe(false);
  });
});

// =============================================================================
// Timezone warning
// =============================================================================

describe("runDailyBillingJob — invalid timezone warning", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records a timezoneWarning when org has an invalid timezone", async () => {
    const db = makeDb({ orgRows: [makeOrg({ id: "org-bad-tz", timezone: "Not/ATimezone" })] });
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);

    const result = await runDailyBillingJob();

    expect(result.timezoneWarnings).toHaveLength(1);
    expect(result.timezoneWarnings[0].organizationId).toBe("org-bad-tz");
    expect(result.timezoneWarnings[0].warning).toContain("Not/ATimezone");
  });

  it("does not add a timezoneWarning for valid timezone", async () => {
    const db = makeDb({ orgRows: [makeOrg({ timezone: "Africa/Maputo" })] });
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);

    const result = await runDailyBillingJob();

    expect(result.timezoneWarnings).toHaveLength(0);
  });

  it("still processes the org (with UTC fallback) when timezone is invalid", async () => {
    const db = makeDb({
      orgRows: [makeOrg({ id: "org-bad-tz", timezone: "Not/ATimezone" })],
      installmentUpdateCount: 2,
    });
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);

    const result = await runDailyBillingJob();

    expect(result.organizationsProcessed).toBe(1);
    expect(result.totalInstallmentsMarkedOverdue).toBe(2);
  });
});

// =============================================================================
// Audit log persistence
// =============================================================================

describe("runDailyBillingJob — audit log", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes an audit log entry after the job completes", async () => {
    const db = makeDb();
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);

    const result = await runDailyBillingJob();

    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entity: "BillingJob",
          entityId: result.jobRunId,
          action: "daily_billing_job.completed",
        }),
      })
    );
  });

  it("uses daily_billing_job.completed_with_errors when errors occurred", async () => {
    const db = {
      organization: {
        findMany: vi.fn().mockResolvedValue([makeOrg({ id: "org-bad" })]),
      },
      installment: {
        updateMany: vi.fn().mockRejectedValue(new Error("DB timeout")),
        findMany: vi.fn().mockResolvedValue([]),
      },
      invoice: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      auditLog: { create: vi.fn().mockResolvedValue(undefined) },
    };
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);

    await runDailyBillingJob();

    const auditCall = (db.auditLog.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(auditCall.data.action).toBe("daily_billing_job.completed_with_errors");
  });

  it("does not abort the job when audit log write fails", async () => {
    const db = makeDb({ installmentUpdateCount: 2 });
    db.auditLog.create.mockRejectedValue(new Error("audit DB down"));
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);

    const result = await runDailyBillingJob();

    // Job result is intact despite audit failure
    expect(result.totalInstallmentsMarkedOverdue).toBe(2);
    expect(result.errors).toHaveLength(0);
  });
});

// =============================================================================
// Job result structure
// =============================================================================

describe("runDailyBillingJob — result shape", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a complete DailyBillingJobResult with all required fields", async () => {
    const db = makeDb({
      installmentUpdateCount: 2,
      invoiceUpdateCounts: [1, 3],
      installmentFindRows: [{ invoiceId: "inv-1" }],
    });
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);

    const result = await runDailyBillingJob();

    expect(result).toHaveProperty("jobRunId");
    expect(result).toHaveProperty("startedAt");
    expect(result).toHaveProperty("completedAt");
    expect(result).toHaveProperty("organizationsProcessed");
    expect(result).toHaveProperty("organizationsSkipped");
    expect(result).toHaveProperty("totalInvoicesMarkedOverdue");
    expect(result).toHaveProperty("totalInstallmentsMarkedOverdue");
    expect(result).toHaveProperty("errors");
    expect(result).toHaveProperty("timezoneWarnings");
    expect(Array.isArray(result.errors)).toBe(true);
    expect(Array.isArray(result.timezoneWarnings)).toBe(true);
    expect(result.startedAt).toBeInstanceOf(Date);
    expect(result.completedAt).toBeInstanceOf(Date);
  });

  it("captures errors per org without aborting the whole job", async () => {
    const db = {
      organization: {
        findMany: vi.fn().mockResolvedValue([makeOrg({ id: "org-bad" })]),
      },
      installment: {
        updateMany: vi.fn().mockRejectedValue(new Error("DB timeout")),
        findMany: vi.fn().mockResolvedValue([]),
      },
      invoice: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      auditLog: { create: vi.fn().mockResolvedValue(undefined) },
    };
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);

    const result = await runDailyBillingJob();

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].organizationId).toBe("org-bad");
    expect(result.errors[0].error).toBe("DB timeout");
    expect(result.organizationsProcessed).toBe(0);
  });

  it("processes multiple organizations independently", async () => {
    const orgs = [makeOrg({ id: "org-1" }), makeOrg({ id: "org-2" })];
    const db = makeDb({
      orgRows: orgs,
      installmentUpdateCount: 1,
      invoiceUpdateCounts: [1, 0, 1, 0],
    });
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(db);

    const result = await runDailyBillingJob();

    expect(result.organizationsProcessed).toBe(2);
    expect(db.installment.updateMany).toHaveBeenCalledTimes(2);
  });
});
