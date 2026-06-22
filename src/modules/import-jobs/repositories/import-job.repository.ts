import { getDb } from "@/server/db";
import { NotFoundError } from "@/shared/lib/command";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult, PaginationParams } from "@/shared/types/common";
import type {
  ImportJob,
  ImportJobType,
  ImportJobStatus,
  ImportJobFilters,
  ImportJobListItem,
  ImportJobKPIs,
  ImportValidationSummary,
  ImportExecutionSummary,
} from "@/modules/import-jobs/types";

// =============================================================================
// IMPORT JOB REPOSITORY
// Generic and reusable across every import type. Every lookup is scoped to
// organizationId — staged row data and execution results must never be
// readable or executable across tenants.
// =============================================================================

const importJobSelect = {
  id: true,
  organizationId: true,
  type: true,
  status: true,
  uploadedFileName: true,
  totalRows: true,
  successRows: true,
  failedRows: true,
  rowsData: true,
  resultData: true,
  validationSummary: true,
  executionSummary: true,
  startedAt: true,
  completedAt: true,
  uploadedById: true,
  uploadedBy: { select: { id: true, name: true } },
  createdAt: true,
} as const;

const importJobListSelect = {
  id: true,
  type: true,
  status: true,
  uploadedFileName: true,
  totalRows: true,
  successRows: true,
  failedRows: true,
  uploadedBy: { select: { id: true, name: true } },
  createdAt: true,
} as const;

interface ImportJobRow {
  id: string;
  organizationId: string;
  type: string;
  status: string;
  uploadedFileName: string;
  totalRows: number;
  successRows: number;
  failedRows: number;
  rowsData: string | null;
  resultData: string | null;
  validationSummary: string | null;
  executionSummary: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  uploadedById: string | null;
  uploadedBy: { id: string; name: string } | null;
  createdAt: Date;
}

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function mapToImportJob(row: ImportJobRow): ImportJob {
  return {
    id: row.id,
    organizationId: row.organizationId,
    type: row.type as ImportJobType,
    status: row.status as ImportJobStatus,
    uploadedFileName: row.uploadedFileName,
    totalRows: row.totalRows,
    successRows: row.successRows,
    failedRows: row.failedRows,
    rowsData: parseJson<unknown[]>(row.rowsData),
    resultData: parseJson<unknown[]>(row.resultData),
    validationSummary: parseJson<ImportValidationSummary>(row.validationSummary),
    executionSummary: parseJson<ImportExecutionSummary>(row.executionSummary),
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    uploadedById: row.uploadedById,
    uploadedByName: row.uploadedBy?.name ?? null,
    createdAt: row.createdAt,
  };
}

export async function createImportJob(data: {
  organizationId: string;
  type: ImportJobType;
  uploadedFileName: string;
  totalRows: number;
  rowsData: unknown[];
  validationSummary: ImportValidationSummary;
  uploadedById: string;
}): Promise<ImportJob> {
  const db = await getDb();
  const row = await db.importJob.create({
    data: {
      organizationId: data.organizationId,
      type: data.type,
      status: "VALIDATED",
      uploadedFileName: data.uploadedFileName,
      totalRows: data.totalRows,
      rowsData: JSON.stringify(data.rowsData),
      validationSummary: JSON.stringify(data.validationSummary),
      uploadedById: data.uploadedById,
    },
    select: importJobSelect,
  });
  return mapToImportJob(row);
}

export async function findImportJobById(
  id: string,
  organizationId: string
): Promise<ImportJob | null> {
  const db = await getDb();
  const row = await db.importJob.findFirst({
    where: { id, organizationId },
    select: importJobSelect,
  });
  return row ? mapToImportJob(row) : null;
}

export async function updateImportJob(
  id: string,
  organizationId: string,
  data: {
    status?: ImportJobStatus;
    successRows?: number;
    failedRows?: number;
    resultData?: unknown[];
    executionSummary?: ImportExecutionSummary;
    startedAt?: Date;
    completedAt?: Date;
  }
): Promise<ImportJob> {
  const db = await getDb();
  const { count } = await db.importJob.updateMany({
    where: { id, organizationId },
    data: {
      ...(data.status !== undefined && { status: data.status }),
      ...(data.successRows !== undefined && { successRows: data.successRows }),
      ...(data.failedRows !== undefined && { failedRows: data.failedRows }),
      ...(data.resultData !== undefined && { resultData: JSON.stringify(data.resultData) }),
      ...(data.executionSummary !== undefined && {
        executionSummary: JSON.stringify(data.executionSummary),
      }),
      ...(data.startedAt !== undefined && { startedAt: data.startedAt }),
      ...(data.completedAt !== undefined && { completedAt: data.completedAt }),
    },
  });
  if (count === 0) throw new NotFoundError("ImportJob", id);

  const updated = await findImportJobById(id, organizationId);
  if (!updated) throw new NotFoundError("ImportJob", id);
  return updated;
}

export async function listImportJobs(
  organizationId: string,
  filters: ImportJobFilters,
  params: PaginationParams
): Promise<PaginatedResult<ImportJobListItem>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(params);

  const where = {
    organizationId,
    ...(filters.search && { uploadedFileName: { contains: filters.search } }),
    ...(filters.type && { type: filters.type }),
    ...(filters.status && { status: filters.status }),
    ...(filters.uploadedById && { uploadedById: filters.uploadedById }),
    ...((filters.dateFrom || filters.dateTo) && {
      createdAt: {
        ...(filters.dateFrom && { gte: new Date(filters.dateFrom) }),
        ...(filters.dateTo && { lte: new Date(filters.dateTo) }),
      },
    }),
  };

  const [rows, total] = await Promise.all([
    db.importJob.findMany({
      where,
      select: importJobListSelect,
      skip,
      take,
      orderBy: { createdAt: "desc" },
    }),
    db.importJob.count({ where }),
  ]);

  const data: ImportJobListItem[] = rows.map((row) => ({
    id: row.id,
    type: row.type as ImportJobType,
    status: row.status as ImportJobStatus,
    uploadedFileName: row.uploadedFileName,
    totalRows: row.totalRows,
    successRows: row.successRows,
    failedRows: row.failedRows,
    uploadedByName: row.uploadedBy?.name ?? null,
    createdAt: row.createdAt,
  }));

  return buildPaginationMeta(data, total, params);
}

export async function getImportJobDetail(
  jobId: string,
  organizationId: string
): Promise<ImportJob | null> {
  return findImportJobById(jobId, organizationId);
}

export async function getImportJobKPIs(organizationId: string): Promise<ImportJobKPIs> {
  const db = await getDb();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [totalImports, importsToday, statusCounts, successSum] = await Promise.all([
    db.importJob.count({ where: { organizationId } }),
    db.importJob.count({ where: { organizationId, createdAt: { gte: startOfToday } } }),
    db.importJob.groupBy({
      by: ["status"],
      where: { organizationId },
      _count: { status: true },
    }),
    db.importJob.aggregate({
      where: { organizationId },
      _sum: { successRows: true },
    }),
  ]);

  const successfulImports = statusCounts.find((s) => s.status === "COMPLETED")?._count.status ?? 0;
  const failedImports = statusCounts.find((s) => s.status === "FAILED")?._count.status ?? 0;
  const finishedImports = successfulImports + failedImports;
  const successRate = finishedImports > 0 ? Math.round((successfulImports / finishedImports) * 100) : 0;

  return {
    totalImports,
    importsToday,
    successfulImports,
    failedImports,
    totalRecordsImported: successSum._sum.successRows ?? 0,
    successRate,
  };
}
