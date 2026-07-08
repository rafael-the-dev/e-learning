import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import type {
  CertificateExportDownloadRecord,
  CertificateExportRecord,
} from "@/modules/certificates/types/repository";

// =============================================================================
// CERTIFICATE EXPORT REPOSITORY (Phase 2B) — artifact tracking, persistence only
// -----------------------------------------------------------------------------
// Tracks export artifact rows (PDF / API / MINISTRY). It renders NO PDF, makes NO
// storage/upload call, and computes NO checksum — a command/export pipeline
// produces the file and its checksum and hands the values here to persist. Every
// query is org-scoped; updates touch status/metadata columns only. No delete.
// =============================================================================

const exportSelect = {
  id: true,
  organizationId: true,
  certificateId: true,
  exportType: true,
  fileUrl: true,
  fileChecksum: true,
  exportedBy: true,
  exportedAt: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

type Row = Record<string, unknown>;

function toRecord(row: Row): CertificateExportRecord {
  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
    certificateId: row.certificateId as string,
    exportType: row.exportType as string,
    fileUrl: (row.fileUrl as string | null) ?? null,
    fileChecksum: (row.fileChecksum as string | null) ?? null,
    exportedBy: (row.exportedBy as string | null) ?? null,
    exportedAt: (row.exportedAt as Date | null) ?? null,
    status: row.status as string,
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
  };
}

export interface CreateCertificateExportParams {
  organizationId: string;
  certificateId: string;
  exportType: string;
  fileUrl?: string | null;
  fileChecksum?: string | null;
  exportedBy?: string | null;
  exportedAt?: Date | null;
  status?: string;
}

export async function createCertificateExport(
  params: CreateCertificateExportParams,
  client?: PrismaClientOrTx
): Promise<CertificateExportRecord> {
  const db = client ?? (await getDb());
  const row = await db.certificateExport.create({
    data: {
      organizationId: params.organizationId,
      certificateId: params.certificateId,
      exportType: params.exportType,
      fileUrl: params.fileUrl ?? null,
      fileChecksum: params.fileChecksum ?? null,
      exportedBy: params.exportedBy ?? null,
      exportedAt: params.exportedAt ?? null,
      status: params.status,
    },
    select: exportSelect,
  });
  return toRecord(row);
}

export interface FindCertificateExportByIdParams {
  id: string;
  organizationId: string;
}

export async function findCertificateExportById(
  params: FindCertificateExportByIdParams,
  client?: PrismaClientOrTx
): Promise<CertificateExportRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.certificateExport.findFirst({
    where: { id: params.id, organizationId: params.organizationId },
    select: exportSelect,
  });
  return row ? toRecord(row) : null;
}

export interface ListCertificateExportsParams {
  organizationId: string;
  certificateId?: string;
  exportType?: string;
  status?: string;
  skip?: number;
  take?: number;
}

export async function listCertificateExports(
  params: ListCertificateExportsParams,
  client?: PrismaClientOrTx
): Promise<CertificateExportRecord[]> {
  const db = client ?? (await getDb());
  const where: Record<string, unknown> = { organizationId: params.organizationId };
  if (params.certificateId !== undefined) where.certificateId = params.certificateId;
  if (params.exportType !== undefined) where.exportType = params.exportType;
  if (params.status !== undefined) where.status = params.status;

  const rows = await db.certificateExport.findMany({
    where,
    select: exportSelect,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    skip: params.skip,
    take: params.take,
  });
  return rows.map(toRecord);
}

export interface ListCertificateIdsWithReadyExportParams {
  organizationId: string;
  certificateIds: string[];
}

/** The subset of the given certificate ids that have at least one READY export
 *  (Phase 10 portal `canDownload` flag) — one org-scoped query, no N+1. Returns a
 *  deduped id list; `[]` for an empty input. */
export async function listCertificateIdsWithReadyExport(
  params: ListCertificateIdsWithReadyExportParams,
  client?: PrismaClientOrTx
): Promise<string[]> {
  if (params.certificateIds.length === 0) return [];
  const db = client ?? (await getDb());
  const rows = await db.certificateExport.findMany({
    where: {
      organizationId: params.organizationId,
      certificateId: { in: params.certificateIds },
      status: "READY",
    },
    select: { certificateId: true },
  });
  return [...new Set(rows.map((r) => r.certificateId as string))];
}

export interface FindCertificateExportDownloadByIdParams {
  organizationId: string;
  exportId: string;
}

/** Org-scoped composed read for the authenticated download path (Phase 8C): the
 *  export row + the minimal certificate columns. Returns `null` when the export is
 *  absent in this tenant, its certificate is missing, or the certificate is
 *  soft-deleted (all → NOT_FOUND at the caller). Reads ONLY the export + certificate
 *  tables — never the Transcript or any Academic Core table. Status is returned
 *  as-is (the caller decides READY-gating); no write. */
export async function findCertificateExportDownloadById(
  params: FindCertificateExportDownloadByIdParams,
  client?: PrismaClientOrTx
): Promise<CertificateExportDownloadRecord | null> {
  const db = client ?? (await getDb());

  const exportRow = await db.certificateExport.findFirst({
    where: { id: params.exportId, organizationId: params.organizationId },
    select: {
      id: true,
      organizationId: true,
      status: true,
      exportType: true,
      fileUrl: true,
      fileChecksum: true,
      certificateId: true,
    },
  });
  if (!exportRow) return null;

  const certificate = await db.certificate.findFirst({
    where: {
      id: exportRow.certificateId as string,
      organizationId: params.organizationId,
      deletedAt: null,
    },
    select: {
      id: true,
      status: true,
      studentId: true,
      certificateNumber: true,
      certificateType: true,
    },
  });
  // A deleted or missing certificate → treat the export as not downloadable.
  if (!certificate) return null;

  return {
    exportId: exportRow.id as string,
    organizationId: exportRow.organizationId as string,
    status: exportRow.status as string,
    exportType: exportRow.exportType as string,
    fileUrl: (exportRow.fileUrl as string | null) ?? null,
    fileChecksum: (exportRow.fileChecksum as string | null) ?? null,
    certificateId: certificate.id as string,
    certificateStatus: certificate.status as string,
    certificateStudentId: certificate.studentId as string,
    certificateNumber: (certificate.certificateNumber as string | null) ?? null,
    certificateType: certificate.certificateType as string,
  };
}

export interface UpdateCertificateExportStatusParams {
  id: string;
  organizationId: string;
  status?: string;
  fileUrl?: string | null;
  fileChecksum?: string | null;
  exportedBy?: string | null;
  exportedAt?: Date | null;
}

export async function updateCertificateExportStatus(
  params: UpdateCertificateExportStatusParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const data: Record<string, unknown> = {};
  if ("status" in params) data.status = params.status;
  if ("fileUrl" in params) data.fileUrl = params.fileUrl ?? null;
  if ("fileChecksum" in params) data.fileChecksum = params.fileChecksum ?? null;
  if ("exportedBy" in params) data.exportedBy = params.exportedBy ?? null;
  if ("exportedAt" in params) data.exportedAt = params.exportedAt ?? null;

  const res = await db.certificateExport.updateMany({
    where: { id: params.id, organizationId: params.organizationId },
    data,
  });
  return { count: res.count };
}
