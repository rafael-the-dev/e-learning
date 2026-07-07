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

export interface FindCertificateVerificationByIdParams {
  id: string;
  organizationId: string;
}

export async function findCertificateVerificationById(
  params: FindCertificateVerificationByIdParams,
  client?: PrismaClientOrTx
): Promise<CertificateVerificationRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.certificateVerification.findFirst({
    where: { id: params.id, organizationId: params.organizationId },
    select: verificationSelect,
  });
  return row ? toRecord(row) : null;
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
