import { AuthorizationError } from "@/shared/lib/command";
import type { AuthContext } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  CertificateExportStatus,
  CertificateRequestStatus,
  CertificateStatus,
} from "@/modules/certificates/constants";
import { countCertificatesByStatus } from "@/modules/certificates/repositories/certificate.repository";
import { countExportsByStatus } from "@/modules/certificates/repositories/certificate-export.repository";
import {
  countRequestsByStatus,
} from "@/modules/certificates/repositories/certificate-request.repository";
import { countVerifications } from "@/modules/certificates/repositories/certificate-verification.repository";
import type { CertificateHealthKpis } from "@/modules/certificates/types/operational";
import { detectVerificationProjectionMismatches } from "./certificate-maintenance.service";

// =============================================================================
// CERTIFICATE HEALTH SERVICE (Phase 14) — READ-ONLY KPIs
// -----------------------------------------------------------------------------
// Aggregate operational KPIs for the certificate engine: certificate/export/
// request status counts + verification totals/mismatches. Counts ONLY — no
// per-entity data, no checksums / codes / PII, no Academic read, no write. Each
// count is a single batched read (status maps built in one scan per table).
// =============================================================================

export class CertificateHealthService {
  private assertCanView(context: AuthContext): void {
    if (!context.ability.can(PERMISSIONS.CERTIFICATES_VIEW)) {
      throw new AuthorizationError();
    }
  }

  async getHealth(context: AuthContext, now: Date = new Date()): Promise<CertificateHealthKpis> {
    this.assertCanView(context);
    const { organizationId } = context;

    const [certByStatus, exportByStatus, requestByStatus, verificationRows, mismatches] =
      await Promise.all([
        countCertificatesByStatus({ organizationId }),
        countExportsByStatus({ organizationId }),
        countRequestsByStatus({ organizationId }),
        countVerifications({ organizationId }),
        detectVerificationProjectionMismatches(organizationId),
      ]);

    const cert = (status: string): number => certByStatus[status] ?? 0;
    const totalCertificates = Object.values(certByStatus).reduce((a, b) => a + b, 0);

    return {
      totalCertificates,
      issued: cert(CertificateStatus.ISSUED),
      revoked: cert(CertificateStatus.REVOKED),
      suspended: cert(CertificateStatus.SUSPENDED),
      stale: cert(CertificateStatus.STALE),
      pendingApproval: cert(CertificateStatus.PENDING_APPROVAL),
      draft: cert(CertificateStatus.DRAFT),
      exportsReady: exportByStatus[CertificateExportStatus.READY] ?? 0,
      exportsFailed: exportByStatus[CertificateExportStatus.FAILED] ?? 0,
      verificationRows,
      verificationMismatches: mismatches.length,
      requestsPending: requestByStatus[CertificateRequestStatus.PENDING] ?? 0,
      requestsApproved: requestByStatus[CertificateRequestStatus.APPROVED] ?? 0,
      requestsFulfilled: requestByStatus[CertificateRequestStatus.FULFILLED] ?? 0,
      generatedAt: now,
    };
  }
}

export const certificateHealthService = new CertificateHealthService();
