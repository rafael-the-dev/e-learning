import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import type { CertificateVerificationRecord } from "@/modules/certificates/types/repository";

// =============================================================================
// CERTIFICATE VERIFICATION REPOSITORY (Phase 2B) — persistence only
// -----------------------------------------------------------------------------
// The 1:1 public-verification projection row for a certificate. This layer stores
// and reads the internal record ONLY: it shapes NO public response, applies NO
// rate limiting, and enforces NO status lifecycle beyond persisting the columns a
// command sets. The internal reads here are org-scoped; a public-by-code lookup
// (no tenant context) is a later phase and lives elsewhere.
// =============================================================================

const verificationSelect = {
  id: true,
  organizationId: true,
  certificateId: true,
  verificationCode: true,
  publicStatus: true,
  verificationCount: true,
  lastVerifiedAt: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

type Row = Record<string, unknown>;

function toRecord(row: Row): CertificateVerificationRecord {
  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
    certificateId: row.certificateId as string,
    verificationCode: row.verificationCode as string,
    publicStatus: row.publicStatus as string,
    verificationCount: row.verificationCount as number,
    lastVerifiedAt: (row.lastVerifiedAt as Date | null) ?? null,
    expiresAt: (row.expiresAt as Date | null) ?? null,
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
  };
}

export interface CreateCertificateVerificationParams {
  organizationId: string;
  certificateId: string;
  verificationCode: string;
  publicStatus?: string;
  expiresAt?: Date | null;
}

export async function createCertificateVerification(
  params: CreateCertificateVerificationParams,
  client?: PrismaClientOrTx
): Promise<CertificateVerificationRecord> {
  const db = client ?? (await getDb());
  const row = await db.certificateVerification.create({
    data: {
      organizationId: params.organizationId,
      certificateId: params.certificateId,
      verificationCode: params.verificationCode,
      publicStatus: params.publicStatus,
      expiresAt: params.expiresAt ?? null,
    },
    select: verificationSelect,
  });
  return toRecord(row);
}

export interface FindByCodeParams {
  organizationId: string;
  verificationCode: string;
}

/** Internal, org-scoped lookup by code. (The unauthenticated public-by-code
 *  lookup with no tenant context is a later phase, not this method.) */
export async function findCertificateVerificationByCode(
  params: FindByCodeParams,
  client?: PrismaClientOrTx
): Promise<CertificateVerificationRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.certificateVerification.findFirst({
    where: { organizationId: params.organizationId, verificationCode: params.verificationCode },
    select: verificationSelect,
  });
  return row ? toRecord(row) : null;
}

export interface FindByCertificateIdParams {
  organizationId: string;
  certificateId: string;
}

export async function findCertificateVerificationByCertificateId(
  params: FindByCertificateIdParams,
  client?: PrismaClientOrTx
): Promise<CertificateVerificationRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.certificateVerification.findFirst({
    where: { organizationId: params.organizationId, certificateId: params.certificateId },
    select: verificationSelect,
  });
  return row ? toRecord(row) : null;
}

export interface UpdateCertificateVerificationStatusParams {
  id: string;
  organizationId: string;
  publicStatus?: string;
  expiresAt?: Date | null;
  lastVerifiedAt?: Date | null;
}

export async function updateCertificateVerificationStatus(
  params: UpdateCertificateVerificationStatusParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const data: Record<string, unknown> = {};
  if ("publicStatus" in params) data.publicStatus = params.publicStatus;
  if ("expiresAt" in params) data.expiresAt = params.expiresAt ?? null;
  if ("lastVerifiedAt" in params) data.lastVerifiedAt = params.lastVerifiedAt ?? null;

  const res = await db.certificateVerification.updateMany({
    where: { id: params.id, organizationId: params.organizationId },
    data,
  });
  return { count: res.count };
}

export interface ListVerificationsByCertificateIdsParams {
  organizationId: string;
  certificateIds: string[];
}

/** Batch org-scoped fetch of the verification projections for a set of certificates
 *  (Phase 10 portal lists) — one query, no N+1. Returns `[]` for an empty id list. */
export async function listVerificationsByCertificateIds(
  params: ListVerificationsByCertificateIdsParams,
  client?: PrismaClientOrTx
): Promise<CertificateVerificationRecord[]> {
  if (params.certificateIds.length === 0) return [];
  const db = client ?? (await getDb());
  const rows = await db.certificateVerification.findMany({
    where: { organizationId: params.organizationId, certificateId: { in: params.certificateIds } },
    select: verificationSelect,
  });
  return rows.map(toRecord);
}

export interface UpdatePublicStatusByCertificateIdParams {
  organizationId: string;
  certificateId: string;
  publicStatus: string;
}

/** Org-scoped `publicStatus` write addressed by `certificateId` (Phase 9). The
 *  staleness reaction knows the certificate, not the verification row id, so this
 *  updates the 1:1 projection by its owning certificate. Returns the affected count
 *  (`0` when no projection exists — the caller decides whether that is an error).
 *  Touches `publicStatus` only. */
export async function updatePublicStatusByCertificateId(
  params: UpdatePublicStatusByCertificateIdParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const res = await db.certificateVerification.updateMany({
    where: { organizationId: params.organizationId, certificateId: params.certificateId },
    data: { publicStatus: params.publicStatus },
  });
  return { count: res.count };
}

export interface IncrementVerificationCountParams {
  id: string;
  organizationId: string;
  lastVerifiedAt?: Date | null;
}

/** Atomic `verificationCount += 1` (optionally bumping `lastVerifiedAt`), org-scoped. */
export async function incrementVerificationCount(
  params: IncrementVerificationCountParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());
  const data: Record<string, unknown> = { verificationCount: { increment: 1 } };
  if ("lastVerifiedAt" in params) data.lastVerifiedAt = params.lastVerifiedAt ?? null;

  const res = await db.certificateVerification.updateMany({
    where: { id: params.id, organizationId: params.organizationId },
    data,
  });
  return { count: res.count };
}

// ─── Operational read helpers (Phase 14) — READ ONLY, org-scoped ──────────────

/** Total verification projection rows in the tenant (§5 KPI). */
export async function countVerifications(
  params: { organizationId: string },
  client?: PrismaClientOrTx
): Promise<number> {
  const db = client ?? (await getDb());
  return db.certificateVerification.count({ where: { organizationId: params.organizationId } });
}

export interface VerificationMaintenanceRow {
  id: string;
  certificateId: string;
  verificationCode: string;
  publicStatus: string;
  expiresAt: Date | null;
}

/** The minimal verification-projection columns the maintenance probes need (§4:
 *  duplicate detection + projection-mismatch). ONE org-scoped scan; the service
 *  applies the (existing-behaviour) status mapping — no rule lives here. */
export async function listVerificationsForMaintenance(
  params: { organizationId: string },
  client?: PrismaClientOrTx
): Promise<VerificationMaintenanceRow[]> {
  const db = client ?? (await getDb());
  const rows = await db.certificateVerification.findMany({
    where: { organizationId: params.organizationId },
    select: { id: true, certificateId: true, verificationCode: true, publicStatus: true, expiresAt: true },
  });
  return rows.map((r) => ({
    id: r.id as string,
    certificateId: r.certificateId as string,
    verificationCode: r.verificationCode as string,
    publicStatus: r.publicStatus as string,
    expiresAt: (r.expiresAt as Date | null) ?? null,
  }));
}

/** The `lastVerifiedAt` timestamps of projections verified since `since` (§7 metrics
 *  `verification` source). Counts the MOST RECENT verification per certificate in the
 *  window (approximation — no per-hit table exists). ONE scan. */
export async function listVerificationTimestamps(
  params: { organizationId: string; since: Date },
  client?: PrismaClientOrTx
): Promise<Date[]> {
  const db = client ?? (await getDb());
  const rows = await db.certificateVerification.findMany({
    where: { organizationId: params.organizationId, lastVerifiedAt: { gte: params.since } },
    select: { lastVerifiedAt: true },
  });
  return rows.map((r) => r.lastVerifiedAt as Date);
}
