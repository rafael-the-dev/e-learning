import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the job function before importing the command so the command receives
// the mock when it imports from the same path.
vi.mock("@/server/jobs/daily-billing.job", () => ({
  runDailyBillingJob: vi.fn().mockResolvedValue({
    jobRunId: "mock-run-id",
    startedAt: new Date(),
    completedAt: new Date(),
    organizationsProcessed: 1,
    organizationsSkipped: 0,
    totalInvoicesMarkedOverdue: 0,
    totalInstallmentsMarkedOverdue: 0,
    errors: [],
    timezoneWarnings: [],
  }),
}));

import { runDailyBillingJob } from "@/server/jobs/daily-billing.job";
import { RunDailyBillingJobCommand } from "../run-daily-billing-job.command";

// The command has no per-user RBAC; authorization is enforced at the HTTP
// layer. A minimal context is sufficient for unit tests.
const SYSTEM_CTX = { userId: "SYSTEM", organizationId: "system" };

describe("RunDailyBillingJobCommand.execute()", () => {
  beforeEach(() => vi.clearAllMocks());

  it("forwards organizationId to runDailyBillingJob when provided (H2 fix)", async () => {
    const cmd = new RunDailyBillingJobCommand({ organizationId: "org-abc" }, SYSTEM_CTX);
    await cmd.execute();
    expect(runDailyBillingJob).toHaveBeenCalledWith({ organizationId: "org-abc" });
  });

  it("passes undefined organizationId when input is empty", async () => {
    const cmd = new RunDailyBillingJobCommand({}, SYSTEM_CTX);
    await cmd.execute();
    expect(runDailyBillingJob).toHaveBeenCalledWith({ organizationId: undefined });
  });

  it("returns the result from runDailyBillingJob unchanged", async () => {
    const cmd = new RunDailyBillingJobCommand({}, SYSTEM_CTX);
    const result = await cmd.execute();
    expect(result.jobRunId).toBe("mock-run-id");
    expect(Array.isArray(result.timezoneWarnings)).toBe(true);
  });
});

describe("RunDailyBillingJobCommand.validate()", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes when organizationId is a string", async () => {
    const cmd = new RunDailyBillingJobCommand({ organizationId: "org-123" }, SYSTEM_CTX);
    await expect(cmd.validate()).resolves.not.toThrow();
  });

  it("passes when organizationId is omitted", async () => {
    const cmd = new RunDailyBillingJobCommand({}, SYSTEM_CTX);
    await expect(cmd.validate()).resolves.not.toThrow();
  });

  it("throws ValidationError when organizationId is not a string", async () => {
    // @ts-expect-error — intentionally passing wrong type to validate runtime guard
    const cmd = new RunDailyBillingJobCommand({ organizationId: 42 }, SYSTEM_CTX);
    await expect(cmd.validate()).rejects.toThrow("organizationId deve ser uma string");
  });
});

describe("RunDailyBillingJobCommand.authorize()", () => {
  it("resolves without throwing (authorization delegated to HTTP layer)", async () => {
    const cmd = new RunDailyBillingJobCommand({}, SYSTEM_CTX);
    await expect(cmd.authorize()).resolves.not.toThrow();
  });
});
