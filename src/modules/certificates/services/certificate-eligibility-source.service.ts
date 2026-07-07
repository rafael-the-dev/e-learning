import type { PrismaClientOrTx } from "@/server/db";
import {
  findCertificatePolicyById,
  findCourseOverridePolicy,
  findDefaultActivePolicy,
} from "@/modules/certificates/repositories/certificate-policy.repository";
import { findIssuedTranscriptVersionForCertificate } from "@/modules/certificates/repositories/certificate-transcript-source.repository";
import type {
  CertificateEligibilityFacts,
  CertificateEligibilitySourceInput,
  CertificatePolicyFacts,
} from "@/modules/certificates/types/eligibility-source";
import type { CertificatePolicyRecord } from "@/modules/certificates/types/repository";
import type { TranscriptCertificateSourceDto } from "@/modules/certificates/types/transcript-source";

// =============================================================================
// CERTIFICATE ELIGIBILITY SOURCE (Phase 3A) — read aggregation façade (ACL)
// -----------------------------------------------------------------------------
// The single dependency of the future `CertificateEligibilityEngine`. It gathers
// every fact eligibility needs into one `CertificateEligibilityFacts` DTO so the
// engine knows nothing about Prisma, the transcript schema, repositories, finance,
// or org-settings storage.
//
// It is a LOADER, not a decider:
//   • MAY read the Certificate Policy repository and the Transcript source ACL.
//   • MUST NOT evaluate eligibility, compute grades/attendance/completion, choose a
//     policy on merit, generate/issue anything, publish events, or write the DB.
//   • Missing policy → `policy: null`; missing/absent transcript → `transcript: null`.
//     It NEVER throws for "not found" — repository errors, however, propagate
//     unchanged (the caller decides).
// Every returned field is a copied fact; there is no `eligible` flag.
// =============================================================================

/** Contract version of the façade output (metadata only; not a checksum input). */
export const CERTIFICATE_ELIGIBILITY_SOURCE_VERSION = "1.0.0";

function toPolicyFacts(record: CertificatePolicyRecord): CertificatePolicyFacts {
  return {
    id: record.id,
    certificateType: record.certificateType,
    requiresIssuedTranscript: record.requiresIssuedTranscript,
    requiresCourseCompleted: record.requiresCourseCompleted,
    requiresNoPendingSubjects: record.requiresNoPendingSubjects,
    requiresFinancialClearance: record.requiresFinancialClearance,
    requiresManualApproval: record.requiresManualApproval,
    autoIssueOnTranscriptIssued: record.autoIssueOnTranscriptIssued,
    validityMonths: record.validityMonths,
    staleAction: record.staleAction,
  };
}

/**
 * READ-aggregation policy resolution (no evaluation):
 *   • explicit `policyId` → load exactly that policy (no fallback);
 *   • else a `courseId` override, then the org-default active policy.
 * Returns the loaded policy facts, or `null` when none is found.
 */
async function loadPolicyFacts(
  input: CertificateEligibilitySourceInput,
  client?: PrismaClientOrTx
): Promise<CertificatePolicyFacts | null> {
  let record: CertificatePolicyRecord | null = null;

  if (input.policyId) {
    record = await findCertificatePolicyById(
      { id: input.policyId, organizationId: input.organizationId },
      client
    );
  } else {
    if (input.courseId) {
      record = await findCourseOverridePolicy(
        {
          organizationId: input.organizationId,
          certificateType: input.certificateType,
          courseId: input.courseId,
        },
        client
      );
    }
    if (!record) {
      record = await findDefaultActivePolicy(
        { organizationId: input.organizationId, certificateType: input.certificateType },
        client
      );
    }
  }

  return record ? toPolicyFacts(record) : null;
}

/** Load the pinned transcript version through the ACL (never a transcript table).
 *  `null` when no version id was supplied or none is found/issued. */
async function loadTranscriptFacts(
  input: CertificateEligibilitySourceInput,
  client?: PrismaClientOrTx
): Promise<TranscriptCertificateSourceDto | null> {
  if (!input.transcriptVersionId) return null;
  return findIssuedTranscriptVersionForCertificate(
    { organizationId: input.organizationId, transcriptVersionId: input.transcriptVersionId },
    client
  );
}

/**
 * Aggregate every fact required for certificate eligibility into one DTO. Loads
 * are sequential to stay safe when `client` is an interactive transaction. The
 * result is frozen — this façade returns facts, not a mutable working set.
 */
export async function loadCertificateEligibilityFacts(
  input: CertificateEligibilitySourceInput,
  client?: PrismaClientOrTx
): Promise<CertificateEligibilityFacts> {
  const policy = await loadPolicyFacts(input, client);
  const transcript = await loadTranscriptFacts(input, client);

  return Object.freeze({
    policy,
    transcript,
    // Finance integration is a future phase; the interface exists, the value is null.
    financialClearance: null,
    // No administrative sources yet.
    administrative: {} as Record<string, never>,
    metadata: {
      loadedAt: new Date(),
      sourceVersion: CERTIFICATE_ELIGIBILITY_SOURCE_VERSION,
    },
  });
}
