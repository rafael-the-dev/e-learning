import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import type { CertificatePublicSource } from "@/modules/certificates/types/public-verification";

// =============================================================================
// CERTIFICATE PUBLIC VERIFICATION REPOSITORY (Phase 7) — persistence only
// -----------------------------------------------------------------------------
// Two projection operations that span the verification row + the certificate +
// (for display) the organization name. NO transcript, grade, attendance, or
// finance table is ever touched; NO academic value is recomputed. Both operations
// select ONLY the columns the public surface needs (defense-in-depth against
// leaking sensitive columns), and neither decides a lifecycle transition.
//
//   • findPublicVerificationByCode — global-by-code lookup (the verification code
//     is globally unique, so the public path has no tenant context up front). It
//     composes three point lookups (verification → certificate → organization);
//     it never joins in transcript/academic data.
//   • markExpiredCertificateVerifications — the org-scoped expiry SWEEP. It flips
//     the projection VALID → EXPIRED for ISSUED certificates whose verification
//     `expiresAt` has passed. It NEVER changes `Certificate.status` (D-6).
// =============================================================================

export interface FindPublicVerificationByCodeParams {
  verificationCode: string;
}

/** Global-by-code public lookup, composed from flat point reads. Returns the
 *  minimal internal source, or `null` when the code is unknown (the service maps
 *  a missing/soft-deleted certificate to NOT_FOUND — existence is never leaked). */
export async function findPublicVerificationByCode(
  params: FindPublicVerificationByCodeParams,
  client?: PrismaClientOrTx
): Promise<CertificatePublicSource | null> {
  const db = client ?? (await getDb());

  const verification = await db.certificateVerification.findFirst({
    where: { verificationCode: params.verificationCode },
    select: {
      id: true,
      organizationId: true,
      certificateId: true,
      publicStatus: true,
    },
  });
  if (!verification) return null;

  const certificate = await db.certificate.findFirst({
    where: {
      id: verification.certificateId as string,
      organizationId: verification.organizationId as string,
    },
    select: {
      status: true,
      certificateNumber: true,
      certificateType: true,
      issuedAt: true,
      expiresAt: true,
      deletedAt: true,
      studentSnapshot: true,
      courseSnapshot: true,
    },
  });
  // A verification row without its certificate is a data-integrity edge; treat it
  // as NOT_FOUND rather than leaking the row's existence.
  if (!certificate) return null;

  const organization = await db.organization.findFirst({
    where: { id: verification.organizationId as string },
    select: { name: true },
  });

  return {
    organizationId: verification.organizationId as string,
    verificationId: verification.id as string,
    organizationName: (organization?.name as string | null) ?? null,
    verificationPublicStatus: verification.publicStatus as string,
    certificateStatus: certificate.status as string,
    certificateNumber: (certificate.certificateNumber as string | null) ?? null,
    certificateType: certificate.certificateType as string,
    issuedAt: (certificate.issuedAt as Date | null) ?? null,
    expiresAt: (certificate.expiresAt as Date | null) ?? null,
    certificateDeleted: certificate.deletedAt != null,
    studentSnapshot: certificate.studentSnapshot as string,
    courseSnapshot: (certificate.courseSnapshot as string | null) ?? null,
  };
}

export interface MarkExpiredCertificateVerificationsParams {
  organizationId: string;
  now: Date;
}

/** Org-scoped expiry sweep: flips VALID → EXPIRED for the verification projections
 *  of ISSUED, non-deleted certificates whose verification `expiresAt <= now`.
 *
 *  Deliberately projection-only (D-6): `Certificate.status` is NEVER touched, so a
 *  certificate stays historically ISSUED. The final `updateMany` re-filters on
 *  `publicStatus = VALID`, making the sweep idempotent (a second run flips nothing)
 *  and race-safe (a concurrently revoked/suspended row is no longer VALID → skipped).
 *  Returns the number of projections flipped. */
export async function markExpiredCertificateVerifications(
  params: MarkExpiredCertificateVerificationsParams,
  client?: PrismaClientOrTx
): Promise<{ count: number }> {
  const db = client ?? (await getDb());

  // 1. Candidate projections: still VALID, with a real expiry that has passed.
  const candidates = await db.certificateVerification.findMany({
    where: {
      organizationId: params.organizationId,
      publicStatus: "VALID",
      expiresAt: { not: null, lte: params.now },
    },
    select: { id: true, certificateId: true },
  });
  if (candidates.length === 0) return { count: 0 };

  // 2. Keep only those whose certificate is still ISSUED and not soft-deleted.
  //    (Done as a second point-read set rather than a relation filter so the guard
  //    holds regardless of the driver's relation-filter support.)
  const certificateIds = candidates.map((c) => c.certificateId as string);
  const issued = await db.certificate.findMany({
    where: {
      organizationId: params.organizationId,
      id: { in: certificateIds },
      status: "ISSUED",
      deletedAt: null,
    },
    select: { id: true },
  });
  const issuedIds = new Set(issued.map((c) => c.id as string));
  const toExpire = candidates
    .filter((c) => issuedIds.has(c.certificateId as string))
    .map((c) => c.id as string);
  if (toExpire.length === 0) return { count: 0 };

  // 3. Flip the projection. `publicStatus = VALID` in the WHERE keeps it idempotent
  //    and race-safe.
  const res = await db.certificateVerification.updateMany({
    where: {
      organizationId: params.organizationId,
      id: { in: toExpire },
      publicStatus: "VALID",
    },
    data: { publicStatus: "EXPIRED" },
  });
  return { count: res.count };
}
