import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn().mockResolvedValue(new Set()),
  createAbility: vi.fn().mockReturnValue({ can: vi.fn().mockReturnValue(true) }),
}));

vi.mock("@/modules/import-jobs/repositories/import-job.repository", () => ({
  findImportJobById: vi.fn(),
  updateImportJob: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/modules/audit-logs/services/audit.service", () => ({
  auditService: { log: vi.fn().mockResolvedValue(undefined) },
}));

const { createMany, transaction } = vi.hoisted(() => ({
  createMany: vi.fn().mockResolvedValue({ count: 0 }),
  transaction: vi.fn(async (fn: (tx: { teacher: { createMany: typeof createMany } }) => Promise<unknown>) =>
    fn({ teacher: { createMany } })
  ),
}));

vi.mock("@/server/db", () => ({
  getDb: vi.fn().mockResolvedValue({ $transaction: transaction }),
}));

import { createAbility } from "@/server/auth/rbac";
import {
  findImportJobById,
  updateImportJob,
} from "@/modules/import-jobs/repositories/import-job.repository";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { ExecuteTeachersImportCommand } from "../execute-teachers-import.command";
import type { ImportRowResult } from "@/modules/teachers/import/types";
import type { ImportJob } from "@/modules/import-jobs/types";

const CTX = { userId: "user-1", organizationId: "org-1" };

function makeRow(rowNumber: number, state: ImportRowResult["state"] = "VALID"): ImportRowResult {
  return {
    rowNumber,
    data: {
      firstName: `Professor${rowNumber}`,
      lastName: "Sobrenome",
      documentNumber: `DOC${rowNumber}`,
    },
    state,
    messages: state === "WARNING" ? ["aviso de teste"] : [],
    issues:
      state === "WARNING"
        ? [{ field: "gender", message: "aviso de teste", severity: "WARNING" }]
        : [],
  };
}

function makeJob(overrides: Partial<ImportJob> = {}): ImportJob {
  return {
    id: "job-1",
    organizationId: "org-1",
    type: "TEACHERS",
    status: "VALIDATED",
    uploadedFileName: "professores.csv",
    totalRows: 1,
    successRows: 0,
    failedRows: 0,
    rowsData: [makeRow(1)],
    resultData: null,
    validationSummary: null,
    executionSummary: null,
    startedAt: null,
    completedAt: null,
    uploadedById: "user-1",
    uploadedByName: "Test User",
    createdAt: new Date(),
    ...overrides,
  };
}

describe("ExecuteTeachersImportCommand — validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws NotFoundError when the job does not exist (or belongs to another org)", async () => {
    (findImportJobById as Mock).mockResolvedValue(null);
    const cmd = new ExecuteTeachersImportCommand({ jobId: "missing" }, CTX);
    await expect(cmd.validate()).rejects.toThrow();
  });

  it("throws BusinessRuleError when the job is not in VALIDATED status", async () => {
    (findImportJobById as Mock).mockResolvedValue(makeJob({ status: "COMPLETED" }));
    const cmd = new ExecuteTeachersImportCommand({ jobId: "job-1" }, CTX);
    await expect(cmd.validate()).rejects.toThrow();
  });
});

describe("ExecuteTeachersImportCommand — authorization", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a user without teachers.import permission", async () => {
    (createAbility as Mock).mockReturnValue({ can: vi.fn().mockReturnValue(false) });
    const cmd = new ExecuteTeachersImportCommand({ jobId: "job-1" }, CTX);
    await expect(cmd.authorize()).rejects.toThrow();
  });
});

describe("ExecuteTeachersImportCommand — execute", () => {
  beforeEach(() => vi.clearAllMocks());

  it("skips ERROR rows, imports VALID/WARNING rows via createMany, and marks the job COMPLETED", async () => {
    const rows = [makeRow(1, "VALID"), makeRow(2, "WARNING"), makeRow(3, "ERROR")];
    (findImportJobById as Mock).mockResolvedValue(makeJob({ rowsData: rows, totalRows: 3 }));

    const cmd = new ExecuteTeachersImportCommand({ jobId: "job-1" }, CTX);
    await cmd.validate();
    const report = await cmd.execute();

    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ organizationId: "org-1", firstName: "Professor1", status: "ACTIVE" }),
        expect.objectContaining({ organizationId: "org-1", firstName: "Professor2", status: "ACTIVE" }),
      ]),
    });

    expect(report.importedCount).toBe(2);
    expect(report.skippedCount).toBe(1);
    expect(report.failedCount).toBe(0);

    expect(updateImportJob).toHaveBeenCalledWith(
      "job-1",
      "org-1",
      expect.objectContaining({ status: "COMPLETED", successRows: 2, failedRows: 1 })
    );
    expect(auditService.log).toHaveBeenCalledWith(
      CTX,
      expect.objectContaining({ action: "import.job.processing" })
    );
    expect(auditService.log).toHaveBeenCalledWith(
      CTX,
      expect.objectContaining({ action: "import.job.completed" })
    );
  });

  it("persists executionSummary with successRows, failedRows, durationMs, and the final status", async () => {
    const rows = [makeRow(1, "VALID"), makeRow(2, "WARNING"), makeRow(3, "ERROR")];
    (findImportJobById as Mock).mockResolvedValue(makeJob({ rowsData: rows, totalRows: 3 }));

    const cmd = new ExecuteTeachersImportCommand({ jobId: "job-1" }, CTX);
    await cmd.validate();
    await cmd.execute();

    expect(updateImportJob).toHaveBeenCalledWith(
      "job-1",
      "org-1",
      expect.objectContaining({
        status: "COMPLETED",
        executionSummary: {
          successRows: 2,
          failedRows: 1,
          durationMs: expect.any(Number),
        },
      })
    );
  });

  it("defaults status to ACTIVE when the row's status is blank or unrecognized", async () => {
    const row: ImportRowResult = {
      rowNumber: 1,
      data: { firstName: "Carlos", documentNumber: "DOC1", status: "ON_LEAVE" },
      state: "WARNING",
      messages: [],
      issues: [],
    };
    (findImportJobById as Mock).mockResolvedValue(makeJob({ rowsData: [row], totalRows: 1 }));

    const cmd = new ExecuteTeachersImportCommand({ jobId: "job-1" }, CTX);
    await cmd.validate();
    await cmd.execute();

    expect(createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ status: "ACTIVE" })],
    });
  });

  it("chunks importable rows into batches of 100 createMany calls", async () => {
    const rows = Array.from({ length: 150 }, (_, i) => makeRow(i + 1, "VALID"));
    (findImportJobById as Mock).mockResolvedValue(makeJob({ rowsData: rows, totalRows: 150 }));

    const cmd = new ExecuteTeachersImportCommand({ jobId: "job-1" }, CTX);
    await cmd.validate();
    const report = await cmd.execute();

    expect(createMany).toHaveBeenCalledTimes(2);
    expect((createMany as Mock).mock.calls[0][0].data).toHaveLength(100);
    expect((createMany as Mock).mock.calls[1][0].data).toHaveLength(50);
    expect(report.importedCount).toBe(150);
  });

  it("isolates a failing chunk: marks only that chunk FAILED and still imports the rest", async () => {
    const rows = Array.from({ length: 150 }, (_, i) => makeRow(i + 1, "VALID"));
    (findImportJobById as Mock).mockResolvedValue(makeJob({ rowsData: rows, totalRows: 150 }));
    transaction
      .mockImplementationOnce(async (fn: (tx: { teacher: { createMany: typeof createMany } }) => Promise<unknown>) =>
        fn({ teacher: { createMany } })
      )
      .mockImplementationOnce(async () => {
        throw new Error("DB indisponível");
      });

    const cmd = new ExecuteTeachersImportCommand({ jobId: "job-1" }, CTX);
    await cmd.validate();
    const report = await cmd.execute();

    expect(report.importedCount).toBe(100);
    expect(report.failedCount).toBe(50);
    expect(report.rows.find((r) => r.rowNumber === 101)?.outcome).toBe("FAILED");
    expect(report.rows.find((r) => r.rowNumber === 101)?.messages.join(" ")).toContain(
      "DB indisponível"
    );
    expect(
      report.rows.find((r) => r.rowNumber === 101)?.issues.some((i) => i.field === "_execution")
    ).toBe(true);
  });

  it("marks the job FAILED and audits import.job.failed when an unexpected error occurs", async () => {
    (findImportJobById as Mock).mockResolvedValue(makeJob());
    (auditService.log as Mock)
      .mockRejectedValueOnce(new Error("audit indisponível"))
      .mockResolvedValue(undefined);

    const cmd = new ExecuteTeachersImportCommand({ jobId: "job-1" }, CTX);
    await cmd.validate();
    await expect(cmd.execute()).rejects.toThrow("audit indisponível");

    expect(updateImportJob).toHaveBeenCalledWith(
      "job-1",
      "org-1",
      expect.objectContaining({ status: "FAILED" })
    );
    expect(auditService.log).toHaveBeenCalledWith(
      CTX,
      expect.objectContaining({ action: "import.job.failed" })
    );
  });
});
