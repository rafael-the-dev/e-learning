import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import type { CertificateExportRecord } from "@/modules/certificates/types/repository";

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
