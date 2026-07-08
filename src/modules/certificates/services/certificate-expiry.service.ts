import type { PrismaClientOrTx } from "@/server/db";
import { markExpiredCertificateVerifications } from "@/modules/certificates/repositories/certificate-public-verification.repository";

// =============================================================================
// CERTIFICATE EXPIRY SERVICE (Phase 7) — projection maintenance only
// -----------------------------------------------------------------------------
// A thin, org-scoped sweep that keeps the PUBLIC verification projection honest as
// time passes. It marks `CertificateVerification.publicStatus = EXPIRED` for
// ISSUED certificates whose verification `expiresAt` has elapsed.
//
// Deliberately narrow (§1/§2):
//   • Expiry affects the PUBLIC verification projection ONLY.
//   • `Certificate.status` stays ISSUED — a certificate is never "EXPIRED" as a
//     lifecycle status, and no snapshot ever mutates.
//   • REVOKED/SUSPENDED projections are left untouched (only VALID → EXPIRED).
//   • No CertificateEvent, no AuditLog, no domain event — expiry is not a
//     lifecycle transition, and per-sweep events would be pure noise (§8).
//   • A restored certificate with a future `expiresAt` returns to VALID via the
//     restore command; this sweep never blocks that.
//
// `now` is supplied by the caller so the sweep is deterministic and testable;
// callers pass `new Date()` (a scheduled job iterates each tenant).
// =============================================================================

export interface CertificateExpiryRunInput {
  organizationId: string;
  now: Date;
}

export interface CertificateExpiryRunResult {
  organizationId: string;
  expiredCount: number;
}

export class CertificateExpiryService {
  /** Sweep one tenant: flip elapsed VALID projections to EXPIRED. Idempotent. */
  async run(
    input: CertificateExpiryRunInput,
    client?: PrismaClientOrTx
  ): Promise<CertificateExpiryRunResult> {
    const { count } = await markExpiredCertificateVerifications(
      { organizationId: input.organizationId, now: input.now },
      client
    );
    return { organizationId: input.organizationId, expiredCount: count };
  }
}

export const certificateExpiryService = new CertificateExpiryService();
