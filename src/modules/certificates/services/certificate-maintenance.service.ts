import { AuthorizationError } from "@/shared/lib/command";
import type { AuthContext } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  CertificateStatus,
  CertificateVerificationPublicStatus,
} from "@/modules/certificates/constants";
import { listCertificateExports } from "@/modules/certificates/repositories/certificate-export.repository";
import { listVerificationsForMaintenance } from "@/modules/certificates/repositories/certificate-verification.repository";
import { findCertificateStatusesByIds } from "@/modules/certificates/repositories/certificate.repository";
import type {
  CertificateMaintenanceReport,
  DuplicateVerificationGroup,
  FailedExportInfo,
  OrphanExportInfo,
  StuckExportInfo,
  VerificationProjectionMismatch,
} from "@/modules/certificates/types/operational";

// =============================================================================
// CERTIFICATE MAINTENANCE SERVICE (Phase 14) — READ-ONLY DETECTION
// -----------------------------------------------------------------------------
// Detects operational anomalies for an operator to act on: orphaned / stuck /
// failed exports and verification-projection integrity issues. It MUTATES NOTHING
// (no repair, no cleanup write) and introduces NO domain rule — the projection
// mismatch check merely MIRRORS the publicStatus values the existing lifecycle
// commands already maintain (revoke→REVOKED, suspend/stale→SUSPENDED,
// issued→VALID|EXPIRED). Reads only certificate-domain tables; never Academic Core.
// =============================================================================

const DEFAULT_STUCK_THRESHOLD_MINUTES = 60;
const MINUTE_MS = 60_000;

/** Placeholder emitted in place of a raw verification code in a duplicate group key
 *  — a verification code must never leave via an operational response (§10). */
const REDACTED_KEY = "[REDACTED]";

/** The publicStatus value(s) the lifecycle commands maintain for a given certificate
 *  status. Empty ⇒ no projection is expected (pre-issue) / no mapping asserted. This
 *  is a description of EXISTING behaviour, not a new rule. */
export function expectedPublicStatuses(certificateStatus: string): string[] {
  switch (certificateStatus) {
    case CertificateStatus.ISSUED:
      return [
        CertificateVerificationPublicStatus.VALID,
        CertificateVerificationPublicStatus.EXPIRED,
      ];
    case CertificateStatus.SUSPENDED:
    case CertificateStatus.STALE:
      return [CertificateVerificationPublicStatus.SUSPENDED];
    case CertificateStatus.REVOKED:
      return [CertificateVerificationPublicStatus.REVOKED];
    default:
      return [];
  }
}

/** Detect verification projections whose `publicStatus` diverges from the value the
 *  lifecycle maintains for the owning certificate. Only classifies certificates with
 *  a defined mapping (issued/suspended/stale/revoked); pre-issue and orphaned rows
 *  are not treated as mismatches here. Two org-scoped reads, no N+1. */
export async function detectVerificationProjectionMismatches(
  organizationId: string
): Promise<VerificationProjectionMismatch[]> {
  const verifications = await listVerificationsForMaintenance({ organizationId });
  if (verifications.length === 0) return [];

  const certIds = [...new Set(verifications.map((v) => v.certificateId))];
  const certs = await findCertificateStatusesByIds({ organizationId, ids: certIds });
  const statusById = new Map(certs.filter((c) => !c.deletedAt).map((c) => [c.id, c.status]));

  const mismatches: VerificationProjectionMismatch[] = [];
  for (const v of verifications) {
    const certificateStatus = statusById.get(v.certificateId);
    if (!certificateStatus) continue; // missing / soft-deleted → orphan, not a mapping mismatch
    const expected = expectedPublicStatuses(certificateStatus);
    if (expected.length === 0) continue;
    if (!expected.includes(v.publicStatus)) {
      mismatches.push({
        verificationId: v.id,
        certificateId: v.certificateId,
        certificateStatus,
        publicStatus: v.publicStatus,
        expectedPublicStatus: expected,
      });
    }
  }
  return mismatches;
}

export class CertificateMaintenanceService {
  private assertCanView(context: AuthContext): void {
    if (!context.ability.can(PERMISSIONS.CERTIFICATES_VIEW)) {
      throw new AuthorizationError();
    }
  }

  async getReport(
    context: AuthContext,
    now: Date = new Date(),
    stuckThresholdMinutes: number = DEFAULT_STUCK_THRESHOLD_MINUTES
  ): Promise<CertificateMaintenanceReport> {
    this.assertCanView(context);
    const { organizationId } = context;

    // ONE export scan feeds the orphan / stuck / failed probes (no repeated scans).
    const exports = await listCertificateExports({ organizationId });

    // Resolve the owning certificates for the export set (includes soft-deleted).
    const exportCertIds = [...new Set(exports.map((e) => e.certificateId))];
    const certs = await findCertificateStatusesByIds({ organizationId, ids: exportCertIds });
    const liveCertIds = new Set(certs.filter((c) => !c.deletedAt).map((c) => c.id));

    const stuckThresholdMs = stuckThresholdMinutes * MINUTE_MS;

    const orphanExports: OrphanExportInfo[] = [];
    const stuckPendingExports: StuckExportInfo[] = [];
    const failedExports: FailedExportInfo[] = [];

    for (const e of exports) {
      if (!liveCertIds.has(e.certificateId)) {
        orphanExports.push({
          exportId: e.id,
          certificateId: e.certificateId,
          exportType: e.exportType,
          status: e.status,
          createdAt: e.createdAt,
        });
      }
      if (e.status === "PENDING") {
        const ageMs = now.getTime() - e.createdAt.getTime();
        if (ageMs >= stuckThresholdMs) {
          stuckPendingExports.push({
            exportId: e.id,
            certificateId: e.certificateId,
            exportType: e.exportType,
            createdAt: e.createdAt,
            ageMinutes: Math.floor(ageMs / MINUTE_MS),
          });
        }
      }
      if (e.status === "FAILED") {
        failedExports.push({
          exportId: e.id,
          certificateId: e.certificateId,
          exportType: e.exportType,
          createdAt: e.createdAt,
        });
      }
    }

    const verifications = await listVerificationsForMaintenance({ organizationId });
    const duplicateVerifications = this.detectDuplicates(verifications);
    const verificationProjectionMismatches =
      await detectVerificationProjectionMismatches(organizationId);

    return {
      orphanExports,
      stuckPendingExports,
      failedExports,
      duplicateVerifications,
      verificationProjectionMismatches,
      stuckThresholdMinutes,
      generatedAt: now,
    };
  }

  /** Group verification rows on keys that must be unique (`verificationCode`, and the
   *  1:1 `certificateId`). Normally empty (the DB holds unique indexes); a structural
   *  integrity probe, not a domain rule. The grouping still keys internally on the raw
   *  verificationCode (detection unchanged), but the EMITTED key for a code group is
   *  REDACTED — a verification code must never leave via an operational response (§10).
   *  A certificateId key is an internal id (not sensitive) and is emitted as-is. */
  private detectDuplicates(
    rows: Array<{ id: string; certificateId: string; verificationCode: string }>
  ): DuplicateVerificationGroup[] {
    const byCode = new Map<string, string[]>();
    const byCert = new Map<string, string[]>();
    for (const r of rows) {
      (byCode.get(r.verificationCode) ?? byCode.set(r.verificationCode, []).get(r.verificationCode)!).push(r.id);
      (byCert.get(r.certificateId) ?? byCert.set(r.certificateId, []).get(r.certificateId)!).push(r.id);
    }
    const groups: DuplicateVerificationGroup[] = [];
    for (const [, ids] of byCode) {
      if (ids.length > 1) {
        groups.push({ key: REDACTED_KEY, field: "verificationCode", count: ids.length, verificationIds: ids });
      }
    }
    for (const [key, ids] of byCert) {
      if (ids.length > 1) groups.push({ key, field: "certificateId", count: ids.length, verificationIds: ids });
    }
    return groups;
  }
}

export const certificateMaintenanceService = new CertificateMaintenanceService();
