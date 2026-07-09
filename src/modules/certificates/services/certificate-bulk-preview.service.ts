import { AuthorizationError } from "@/shared/lib/command";
import type { AuthContext } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { CertificateStatus } from "@/modules/certificates/constants";
import {
  findActiveCertificatesForPairs,
  findCertificatesByIds,
} from "@/modules/certificates/repositories/certificate.repository";

// =============================================================================
// BULK CERTIFICATE OPERATION PREVIEW SERVICE (Phase 13) — READ-ONLY
// -----------------------------------------------------------------------------
// Validates bulk inputs BEFORE execution so an operator sees what would succeed /
// be blocked, without mutating anything and WITHOUT recomputing eligibility. It
// reads only the Certificate read model (status) — no Academic Core / Transcript
// read, no engine call. `canIssue`/`canGenerate` are shallow, status/duplicate
// checks; the authoritative decision still happens inside the single command at
// execution time.
// =============================================================================

const ISSUABLE: ReadonlySet<string> = new Set([
  CertificateStatus.DRAFT,
  CertificateStatus.PENDING_APPROVAL,
]);

export interface BulkIssuePreviewItem {
  certificateId: string;
  found: boolean;
  currentStatus: string | null;
  canIssue: boolean;
  reason?: string;
}

export interface BulkGeneratePreviewItem {
  transcriptVersionId: string;
  certificateType: string;
  canGenerate: boolean;
  reason?: string;
}

export class BulkCertificateOperationPreviewService {
  private assertCanView(context: AuthContext): void {
    if (!context.ability.can(PERMISSIONS.CERTIFICATES_VIEW)) {
      throw new AuthorizationError();
    }
  }

  /** Preview a bulk ISSUE: per certificate, its current status + whether it is in an
   *  issuable state (DRAFT / PENDING_APPROVAL). Batched (one query); no mutation. */
  async previewIssue(
    context: AuthContext,
    certificateIds: string[]
  ): Promise<BulkIssuePreviewItem[]> {
    this.assertCanView(context);
    const found = await findCertificatesByIds({
      organizationId: context.organizationId,
      ids: certificateIds,
    });
    const byId = new Map(found.map((c) => [c.id, c]));

    return certificateIds.map((certificateId) => {
      const cert = byId.get(certificateId);
      if (!cert) {
        return { certificateId, found: false, currentStatus: null, canIssue: false, reason: "NOT_FOUND" };
      }
      const canIssue = ISSUABLE.has(cert.status);
      return {
        certificateId,
        found: true,
        currentStatus: cert.status,
        canIssue,
        reason: canIssue ? undefined : `NOT_ISSUABLE_FROM_${cert.status}`,
      };
    });
  }

  /** Preview a bulk GENERATE: per item, whether an ACTIVE certificate already exists
   *  for the (transcriptVersion, type) — a shallow duplicate check, NOT eligibility.
   *  ONE batched read loads every potentially-conflicting active certificate; an
   *  in-memory key set then decides each request. The engine still owns the real
   *  generation decision at execution time. */
  async previewGenerate(
    context: AuthContext,
    items: Array<{ transcriptVersionId: string; certificateType: string }>
  ): Promise<BulkGeneratePreviewItem[]> {
    this.assertCanView(context);
    const active = await findActiveCertificatesForPairs({
      organizationId: context.organizationId,
      pairs: items,
    });
    const activeKeys = new Set(active.map((p) => pairKey(p.transcriptVersionId, p.certificateType)));

    return items.map((item) => {
      const exists = activeKeys.has(pairKey(item.transcriptVersionId, item.certificateType));
      return {
        transcriptVersionId: item.transcriptVersionId,
        certificateType: item.certificateType,
        canGenerate: !exists,
        reason: exists ? "CERTIFICATE_ALREADY_ACTIVE" : undefined,
      };
    });
  }
}

/** Composite lookup key for a `(transcriptVersionId, certificateType)` pair. The `::`
 *  separator cannot collide because certificate types are a fixed const-object set. */
function pairKey(transcriptVersionId: string, certificateType: string): string {
  return `${transcriptVersionId}::${certificateType}`;
}

export const bulkCertificateOperationPreviewService = new BulkCertificateOperationPreviewService();
