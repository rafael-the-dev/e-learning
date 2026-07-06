import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import type { TranscriptExportRecord } from "@/modules/transcripts/types";

// =============================================================================
// ACADEMIC TRANSCRIPT EXPORT REPOSITORY (Phase 2)
//
// Export/render tracking rows. Create + read + scoped status/metadata update.
// Org-scoped. No render/PDF logic here (that arrives in Phase 6).
// =============================================================================

const exportSelect = {
  id: true,
  organizationId: true,
  transcriptVersionId: true,
  exportType: true,
  fileUrl: true,
  fileChecksum: true,
  status: true,
  exportedBy: true,
  exportedAt: true,
  createdAt: true,
} as const;

type ExportRow = { [K in keyof typeof exportSelect]: unknown };

function toExportRecord(row: ExportRow): TranscriptExportRecord {
  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
    transcriptVersionId: row.transcriptVersionId as string,
    exportType: row.exportType as string,
    fileUrl: (row.fileUrl as string | null) ?? null,
    fileChecksum: (row.fileChecksum as string | null) ?? null,
    status: row.status as string,
    exportedBy: (row.exportedBy as string | null) ?? null,
    exportedAt: (row.exportedAt as Date | null) ?? null,
    createdAt: row.createdAt as Date,
  };
}

export interface CreateTranscriptExportParams {
  organizationId: string;
  transcriptVersionId: string;
  exportType: string;
  status?: string;
  fileUrl?: string | null;
  fileChecksum?: string | null;
  exportedBy?: string | null;
  exportedAt?: Date | null;
}

export async function createTranscriptExport(
  params: CreateTranscriptExportParams,
  client?: PrismaClientOrTx
): Promise<TranscriptExportRecord> {
  const db = client ?? (await getDb());
  const row = await db.academicTranscriptExport.create({
    data: {
      organizationId: params.organizationId,
      transcriptVersionId: params.transcriptVersionId,
      exportType: params.exportType,
      status: params.status ?? "PENDING",
      fileUrl: params.fileUrl ?? null,
      fileChecksum: params.fileChecksum ?? null,
      exportedBy: params.exportedBy ?? null,
      exportedAt: params.exportedAt ?? null,
    },
    select: exportSelect,
  });
  return toExportRecord(row);
}

export interface FindTranscriptExportByIdParams {
  id: string;
  organizationId: string;
}

export async function findTranscriptExportById(
  params: FindTranscriptExportByIdParams,
  client?: PrismaClientOrTx
): Promise<TranscriptExportRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.academicTranscriptExport.findFirst({
    where: { id: params.id, organizationId: params.organizationId },
    select: exportSelect,
  });
  return row ? toExportRecord(row) : null;
}

export interface ListExportsByVersionParams {
  organizationId: string;
  transcriptVersionId: string;
}

export async function listExportsByVersion(
  params: ListExportsByVersionParams,
  client?: PrismaClientOrTx
): Promise<TranscriptExportRecord[]> {
  const db = client ?? (await getDb());
  const rows = await db.academicTranscriptExport.findMany({
    where: {
      organizationId: params.organizationId,
      transcriptVersionId: params.transcriptVersionId,
    },
    select: exportSelect,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });
  return rows.map(toExportRecord);
}

export interface UpdateTranscriptExportStatusParams {
  id: string;
  organizationId: string;
  status?: string;
  fileUrl?: string | null;
  fileChecksum?: string | null;
  exportedBy?: string | null;
  exportedAt?: Date | null;
}

export async function updateTranscriptExportStatus(
  params: UpdateTranscriptExportStatusParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const data: Record<string, unknown> = {};
  if ("status" in params) data.status = params.status;
  if ("fileUrl" in params) data.fileUrl = params.fileUrl ?? null;
  if ("fileChecksum" in params) data.fileChecksum = params.fileChecksum ?? null;
  if ("exportedBy" in params) data.exportedBy = params.exportedBy ?? null;
  if ("exportedAt" in params) data.exportedAt = params.exportedAt ?? null;

  const res = await db.academicTranscriptExport.updateMany({
    where: { id: params.id, organizationId: params.organizationId },
    data,
  });
  return { count: res.count };
}
