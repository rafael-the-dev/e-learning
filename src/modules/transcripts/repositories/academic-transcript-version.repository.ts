import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import type { TranscriptVersionRecord } from "@/modules/transcripts/types";

// =============================================================================
// ACADEMIC TRANSCRIPT VERSION REPOSITORY (Phase 2)
//
// Version-level data access. Repositories update only the version's own
// metadata columns; they NEVER touch snapshot child rows (levels/subjects/
// assessments/attendance) — child immutability lives in the snapshot repo,
// which exposes no update/delete. The lifecycle orchestration (which version to
// issue/supersede/revoke, checksum verification) belongs to commands.
//
// The mark* helpers are conditional column setters: each `updateMany` WHERE
// includes the EXPECTED source status, so the transition only applies when the
// row is still in that state. This makes the command's read-check-write atomic
// at the DB level — a concurrent transition loses the race and the setter
// returns `{ count: 0 }` (the command interprets that and aborts). Repositories
// still own no transition RULES; they only refuse to write when the precondition
// no longer holds (H1, Sprint 5A).
// =============================================================================

export const versionSelect = {
  id: true,
  organizationId: true,
  transcriptId: true,
  versionNumber: true,
  snapshotDate: true,
  status: true,
  reason: true,
  generatedBy: true,
  issuedBy: true,
  issuedAt: true,
  supersededAt: true,
  revokedAt: true,
  revokedBy: true,
  revokeReason: true,
  checksum: true,
  studentSnapshot: true,
  courseSnapshot: true,
  createdAt: true,
} as const;

type VersionRow = { [K in keyof typeof versionSelect]: unknown };

export function toVersionRecord(row: VersionRow): TranscriptVersionRecord {
  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
    transcriptId: row.transcriptId as string,
    versionNumber: row.versionNumber as number,
    snapshotDate: row.snapshotDate as Date,
    status: row.status as string,
    reason: (row.reason as string | null) ?? null,
    generatedBy: (row.generatedBy as string | null) ?? null,
    issuedBy: (row.issuedBy as string | null) ?? null,
    issuedAt: (row.issuedAt as Date | null) ?? null,
    supersededAt: (row.supersededAt as Date | null) ?? null,
    revokedAt: (row.revokedAt as Date | null) ?? null,
    revokedBy: (row.revokedBy as string | null) ?? null,
    revokeReason: (row.revokeReason as string | null) ?? null,
    checksum: (row.checksum as string | null) ?? null,
    studentSnapshot: row.studentSnapshot as string,
    courseSnapshot: (row.courseSnapshot as string | null) ?? null,
    createdAt: row.createdAt as Date,
  };
}

// ─── Reads ─────────────────────────────────────────────────────────────────

export interface FindVersionByIdParams {
  id: string;
  organizationId: string;
}

export async function findVersionById(
  params: FindVersionByIdParams,
  client?: PrismaClientOrTx
): Promise<TranscriptVersionRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.academicTranscriptVersion.findFirst({
    where: { id: params.id, organizationId: params.organizationId },
    select: versionSelect,
  });
  return row ? toVersionRecord(row) : null;
}

export interface VersionsByTranscriptParams {
  transcriptId: string;
  organizationId: string;
}

export async function findCurrentIssuedVersion(
  params: VersionsByTranscriptParams,
  client?: PrismaClientOrTx
): Promise<TranscriptVersionRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.academicTranscriptVersion.findFirst({
    where: {
      transcriptId: params.transcriptId,
      organizationId: params.organizationId,
      status: "ISSUED",
    },
    select: versionSelect,
    orderBy: { versionNumber: "desc" },
  });
  return row ? toVersionRecord(row) : null;
}

export async function findLatestVersion(
  params: VersionsByTranscriptParams,
  client?: PrismaClientOrTx
): Promise<TranscriptVersionRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.academicTranscriptVersion.findFirst({
    where: { transcriptId: params.transcriptId, organizationId: params.organizationId },
    select: versionSelect,
    orderBy: { versionNumber: "desc" },
  });
  return row ? toVersionRecord(row) : null;
}

/** Count the versions of a transcript that are NOT revoked (any of DRAFT /
 *  ISSUED / SUPERSEDED). Read-only, org-scoped, no business logic — the revoke
 *  command uses it to decide whether the root has become fully revoked. */
export async function countActiveVersions(
  params: VersionsByTranscriptParams,
  client?: PrismaClientOrTx
): Promise<number> {
  const db = client ?? (await getDb());
  return db.academicTranscriptVersion.count({
    where: {
      transcriptId: params.transcriptId,
      organizationId: params.organizationId,
      status: { not: "REVOKED" },
    },
  });
}

export async function listVersionsByTranscript(
  params: VersionsByTranscriptParams,
  client?: PrismaClientOrTx
): Promise<TranscriptVersionRecord[]> {
  const db = client ?? (await getDb());
  const rows = await db.academicTranscriptVersion.findMany({
    where: { transcriptId: params.transcriptId, organizationId: params.organizationId },
    select: versionSelect,
    orderBy: { versionNumber: "asc" },
  });
  return rows.map(toVersionRecord);
}

// ─── Writes (metadata only — never child rows) ───────────────────────────────

export interface CreateVersionParams {
  organizationId: string;
  transcriptId: string;
  versionNumber: number;
  snapshotDate: Date;
  status: string;
  reason?: string | null;
  generatedBy?: string | null;
  checksum?: string | null;
  studentSnapshot: string;
  courseSnapshot?: string | null;
}

export async function createVersion(
  params: CreateVersionParams,
  client?: PrismaClientOrTx
): Promise<TranscriptVersionRecord> {
  const db = client ?? (await getDb());
  const row = await db.academicTranscriptVersion.create({
    data: {
      organizationId: params.organizationId,
      transcriptId: params.transcriptId,
      versionNumber: params.versionNumber,
      snapshotDate: params.snapshotDate,
      status: params.status,
      reason: params.reason ?? null,
      generatedBy: params.generatedBy ?? null,
      checksum: params.checksum ?? null,
      studentSnapshot: params.studentSnapshot,
      courseSnapshot: params.courseSnapshot ?? null,
    },
    select: versionSelect,
  });
  return toVersionRecord(row);
}

export interface UpdateVersionMetadataParams {
  id: string;
  organizationId: string;
  status?: string;
  issuedAt?: Date | null;
  issuedBy?: string | null;
  supersededAt?: Date | null;
  revokedAt?: Date | null;
  revokedBy?: string | null;
  revokeReason?: string | null;
  checksum?: string | null;
}

export async function updateVersionMetadata(
  params: UpdateVersionMetadataParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const data: Record<string, unknown> = {};
  if ("status" in params) data.status = params.status;
  if ("issuedAt" in params) data.issuedAt = params.issuedAt ?? null;
  if ("issuedBy" in params) data.issuedBy = params.issuedBy ?? null;
  if ("supersededAt" in params) data.supersededAt = params.supersededAt ?? null;
  if ("revokedAt" in params) data.revokedAt = params.revokedAt ?? null;
  if ("revokedBy" in params) data.revokedBy = params.revokedBy ?? null;
  if ("revokeReason" in params) data.revokeReason = params.revokeReason ?? null;
  if ("checksum" in params) data.checksum = params.checksum ?? null;

  const res = await db.academicTranscriptVersion.updateMany({
    where: { id: params.id, organizationId: params.organizationId },
    data,
  });
  return { count: res.count };
}

export interface MarkVersionIssuedParams {
  id: string;
  organizationId: string;
  issuedAt: Date;
  issuedBy?: string | null;
  checksum?: string | null;
}

/** Conditional column setter — promotes a DRAFT version to ISSUED. The WHERE
 *  requires `status = 'DRAFT'`, so a version already transitioned by a concurrent
 *  transaction is NOT re-issued and `count` comes back 0. The command decides
 *  *whether* to call this and how to interpret a losing race. */
export async function markVersionIssued(
  params: MarkVersionIssuedParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.academicTranscriptVersion.updateMany({
    where: { id: params.id, organizationId: params.organizationId, status: "DRAFT" },
    data: {
      status: "ISSUED",
      issuedAt: params.issuedAt,
      issuedBy: params.issuedBy ?? null,
      ...("checksum" in params ? { checksum: params.checksum ?? null } : {}),
    },
  });
  return { count: res.count };
}

export interface MarkVersionSupersededParams {
  id: string;
  organizationId: string;
  supersededAt: Date;
}

/** Conditional column setter — supersedes an ISSUED version. The WHERE requires
 *  `status = 'ISSUED'`, so only the (at most one) current issued version can be
 *  superseded; a concurrent supersede/revoke leaves `count` 0. */
export async function markVersionSuperseded(
  params: MarkVersionSupersededParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.academicTranscriptVersion.updateMany({
    where: { id: params.id, organizationId: params.organizationId, status: "ISSUED" },
    data: { status: "SUPERSEDED", supersededAt: params.supersededAt },
  });
  return { count: res.count };
}

export interface MarkVersionRevokedParams {
  id: string;
  organizationId: string;
  revokedAt: Date;
  revokedBy?: string | null;
  revokeReason?: string | null;
}

/** Conditional column setter — revokes a version. The WHERE requires the current
 *  status to be ISSUED or SUPERSEDED (the only revocable states), so a DRAFT or
 *  an already-REVOKED version yields `count` 0 and a concurrent double-revoke
 *  cannot apply twice. */
export async function markVersionRevoked(
  params: MarkVersionRevokedParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.academicTranscriptVersion.updateMany({
    where: {
      id: params.id,
      organizationId: params.organizationId,
      status: { in: ["ISSUED", "SUPERSEDED"] },
    },
    data: {
      status: "REVOKED",
      revokedAt: params.revokedAt,
      revokedBy: params.revokedBy ?? null,
      revokeReason: params.revokeReason ?? null,
    },
  });
  return { count: res.count };
}
