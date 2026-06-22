import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

const { findMany, count, groupBy, aggregate, create, updateMany, findFirst } = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
  groupBy: vi.fn(),
  aggregate: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  getDb: vi.fn().mockResolvedValue({
    importJob: { findMany, count, groupBy, aggregate, create, updateMany, findFirst },
  }),
}));

import {
  listImportJobs,
  getImportJobKPIs,
  getImportJobDetail,
  createImportJob,
  updateImportJob,
} from "../import-job.repository";

const ORG_ID = "org-1";

function makeRawRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    organizationId: ORG_ID,
    type: "STUDENTS",
    status: "COMPLETED",
    uploadedFileName: "alunos.csv",
    totalRows: 10,
    successRows: 8,
    failedRows: 2,
    rowsData: null,
    resultData: null,
    validationSummary: null,
    executionSummary: null,
    startedAt: null,
    completedAt: null,
    uploadedById: "user-1",
    uploadedBy: { id: "user-1", name: "Maria Santos" },
    createdAt: new Date("2026-06-22T08:00:00Z"),
    ...overrides,
  };
}

describe("listImportJobs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes the query to organizationId and maps uploadedBy to uploadedByName", async () => {
    findMany.mockResolvedValue([makeRawRow()]);
    count.mockResolvedValue(1);

    const result = await listImportJobs(ORG_ID, {}, { page: 1, pageSize: 20 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG_ID }) })
    );
    expect(result.data[0].uploadedByName).toBe("Maria Santos");
    expect(result.total).toBe(1);
  });

  it("applies search/type/status/uploadedById/date filters to the where clause", async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);

    await listImportJobs(
      ORG_ID,
      {
        search: "alunos",
        type: "STUDENTS",
        status: "COMPLETED",
        uploadedById: "user-1",
        dateFrom: "2026-01-01",
        dateTo: "2026-12-31",
      },
      { page: 1, pageSize: 20 }
    );

    const where = (findMany as Mock).mock.calls[0][0].where;
    expect(where).toMatchObject({
      organizationId: ORG_ID,
      uploadedFileName: { contains: "alunos" },
      type: "STUDENTS",
      status: "COMPLETED",
      uploadedById: "user-1",
    });
    expect(where.createdAt.gte).toBeInstanceOf(Date);
    expect(where.createdAt.lte).toBeInstanceOf(Date);
  });

  it("omits filters that are not provided", async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);

    await listImportJobs(ORG_ID, {}, { page: 1, pageSize: 20 });

    const where = (findMany as Mock).mock.calls[0][0].where;
    expect(where).not.toHaveProperty("type");
    expect(where).not.toHaveProperty("status");
    expect(where).not.toHaveProperty("uploadedFileName");
    expect(where).not.toHaveProperty("createdAt");
  });
});

describe("getImportJobKPIs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("computes successRate from COMPLETED vs FAILED counts, excluding in-flight jobs", async () => {
    count.mockResolvedValueOnce(10); // totalImports
    count.mockResolvedValueOnce(2); // importsToday
    groupBy.mockResolvedValue([
      { status: "COMPLETED", _count: { status: 6 } },
      { status: "FAILED", _count: { status: 2 } },
      { status: "PROCESSING", _count: { status: 2 } },
    ]);
    aggregate.mockResolvedValue({ _sum: { successRows: 540 } });

    const kpis = await getImportJobKPIs(ORG_ID);

    expect(kpis).toEqual({
      totalImports: 10,
      importsToday: 2,
      successfulImports: 6,
      failedImports: 2,
      totalRecordsImported: 540,
      successRate: 75, // 6 / (6 + 2) = 75%
    });
  });

  it("returns a 0% success rate when no jobs have finished yet", async () => {
    count.mockResolvedValueOnce(0);
    count.mockResolvedValueOnce(0);
    groupBy.mockResolvedValue([]);
    aggregate.mockResolvedValue({ _sum: { successRows: null } });

    const kpis = await getImportJobKPIs(ORG_ID);

    expect(kpis.successRate).toBe(0);
    expect(kpis.totalRecordsImported).toBe(0);
  });

  it("scopes every aggregate query to organizationId", async () => {
    count.mockResolvedValue(0);
    groupBy.mockResolvedValue([]);
    aggregate.mockResolvedValue({ _sum: { successRows: 0 } });

    await getImportJobKPIs(ORG_ID);

    for (const call of (count as Mock).mock.calls) {
      expect(call[0].where).toMatchObject({ organizationId: ORG_ID });
    }
    expect((groupBy as Mock).mock.calls[0][0].where).toMatchObject({ organizationId: ORG_ID });
    expect((aggregate as Mock).mock.calls[0][0].where).toMatchObject({ organizationId: ORG_ID });
  });
});

describe("getImportJobDetail", () => {
  beforeEach(() => vi.clearAllMocks());

  it("looks up by id scoped to organizationId via findFirst, never findUnique on id alone", async () => {
    findFirst.mockResolvedValue(makeRawRow());

    const detail = await getImportJobDetail("job-1", ORG_ID);

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "job-1", organizationId: ORG_ID } })
    );
    expect(detail?.uploadedByName).toBe("Maria Santos");
  });

  it("returns null for a cross-tenant id", async () => {
    findFirst.mockResolvedValue(null);
    const detail = await getImportJobDetail("job-1", "org-2");
    expect(detail).toBeNull();
  });

  it("parses validationSummary/executionSummary JSON columns", async () => {
    findFirst.mockResolvedValue(
      makeRawRow({
        validationSummary: JSON.stringify({ totalRows: 5, validRows: 4, warningRows: 0, errorRows: 1 }),
        executionSummary: JSON.stringify({ successRows: 4, failedRows: 1, durationMs: 1200 }),
      })
    );

    const detail = await getImportJobDetail("job-1", ORG_ID);

    expect(detail?.validationSummary).toEqual({ totalRows: 5, validRows: 4, warningRows: 0, errorRows: 1 });
    expect(detail?.executionSummary).toEqual({ successRows: 4, failedRows: 1, durationMs: 1200 });
  });
});

describe("createImportJob", () => {
  beforeEach(() => vi.clearAllMocks());

  it("serializes rowsData/validationSummary to JSON and defaults status to VALIDATED", async () => {
    create.mockResolvedValue(makeRawRow({ id: "job-2" }));

    await createImportJob({
      organizationId: ORG_ID,
      type: "STUDENTS",
      uploadedFileName: "alunos.csv",
      totalRows: 1,
      rowsData: [{ rowNumber: 1 }],
      validationSummary: { totalRows: 1, validRows: 1, warningRows: 0, errorRows: 0 },
      uploadedById: "user-1",
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: ORG_ID,
          type: "STUDENTS",
          status: "VALIDATED",
          uploadedFileName: "alunos.csv",
          rowsData: JSON.stringify([{ rowNumber: 1 }]),
          validationSummary: JSON.stringify({ totalRows: 1, validRows: 1, warningRows: 0, errorRows: 0 }),
          uploadedById: "user-1",
        }),
      })
    );
  });
});

describe("updateImportJob", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes the update to organizationId and throws NotFoundError when no row matches", async () => {
    updateMany.mockResolvedValue({ count: 0 });

    await expect(updateImportJob("job-1", ORG_ID, { status: "COMPLETED" })).rejects.toThrow();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "job-1", organizationId: ORG_ID } })
    );
  });

  it("re-fetches and returns the updated job on success", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue(makeRawRow({ status: "COMPLETED" }));

    const updated = await updateImportJob("job-1", ORG_ID, { status: "COMPLETED" });

    expect(updated.status).toBe("COMPLETED");
  });
});
