import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import {
  AuthorizationError,
  BaseCommand,
  BusinessRuleError,
  ValidationError,
} from "@/shared/lib/command";
import { createAbility, getUserPermissions } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { CertificateStatus, FinancialClearanceStatus } from "@/modules/certificates/constants";
import {
  generateCertificateSchema,
  type GenerateCertificateInput,
} from "@/modules/certificates/schemas/certificate.schema";
import { loadCertificateEligibilityFacts } from "@/modules/certificates/services/certificate-eligibility-source.service";
import { evaluateCertificateEligibility } from "@/modules/certificates/services/certificate-eligibility.engine";
import {
  createCertificate,
  findExistingActiveCertificate,
} from "@/modules/certificates/repositories/certificate.repository";
import type {
  CertificateEligibilityBlocker,
  CertificateEligibilityWarning,
} from "@/modules/certificates/constants";
import type { CertificateEligibilityFacts } from "@/modules/certificates/types/eligibility-source";

// =============================================================================
// GENERATE CERTIFICATE COMMAND (Phase 4)
// -----------------------------------------------------------------------------
// Creates a certificate record (DRAFT or PENDING_APPROVAL) from an ISSUED
// transcript version. It does NOT issue: no certificate number, no checksum, no
// verification row, no PDF/export, no events, no audit — those belong to later
// phases (§15/§16).
//
// The command ORCHESTRATES; it never decides eligibility (Rules C-3/C-5):
//   1. `CertificateEligibilitySource` loads the facts.
//   2. `CertificateEligibilityEngine` decides (the single authority).
//   3. This command branches ONLY on the result contract
//      (`result.eligible` / `result.requiresApproval`) and persists the outcome.
// It never inspects policy gates, transcript snapshot statuses, or the finance
// flag to make a decision — it only copies facts into the certificate snapshot.
//
// Duplicate prevention: an already-active certificate for the same
// `(transcriptVersionId, certificateType)` is loaded as an administrative FACT
// (`alreadyIssued`) and fed to the engine, so the engine — not the command —
// produces the `CERTIFICATE_ALREADY_ISSUED` decision (mirrors the filtered-unique
// index; does not rely on the DB constraint alone).
//
// Everything runs inside ONE transaction (load → evaluate → duplicate check →
// create). Any failure rolls the whole thing back — no partial certificate. The
// command performs exactly one write, and it is the final step.
// =============================================================================

export interface GenerateCertificateResult {
  certificateId: string;
  status: string;
  certificateType: string;
  transcriptVersionId: string;
  transcriptNumber: string;
  requiresApproval: boolean;
  blockingReasons: CertificateEligibilityBlocker[];
  warnings: CertificateEligibilityWarning[];
}

/** Read a string field from a copied snapshot Record (identity only — never a
 *  business decision). Returns `null` for a missing / non-string / empty value. */
function readString(record: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export class GenerateCertificateCommand extends BaseCommand<
  GenerateCertificateInput,
  GenerateCertificateResult
> {
  async validate(): Promise<void> {
    const parsed = generateCertificateSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.CERTIFICATES_GENERATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<GenerateCertificateResult> {
    const { organizationId } = this.context;
    const input = generateCertificateSchema.parse(this.input);

    const db = await getDb();
    return db.$transaction(async (tx: PrismaClientOrTx) => {
      // 1. Load facts through the single read dependency (the source).
      const loadedFacts = await loadCertificateEligibilityFacts(
        {
          organizationId,
          certificateType: input.certificateType,
          transcriptVersionId: input.transcriptVersionId,
          courseId: input.courseId ?? null,
          policyId: input.policyId ?? null,
        },
        tx
      );

      // 2. Duplicate check — load whether an active certificate already exists and
      //    supply it as an administrative FACT. The engine turns this into the
      //    CERTIFICATE_ALREADY_ISSUED decision; the command decides nothing.
      const existing = await findExistingActiveCertificate(
        {
          organizationId,
          transcriptVersionId: input.transcriptVersionId,
          certificateType: input.certificateType,
        },
        tx
      );
      const facts: CertificateEligibilityFacts = existing
        ? { ...loadedFacts, administrative: { ...loadedFacts.administrative, alreadyIssued: true } }
        : loadedFacts;

      // 3. The engine decides (pure, deterministic). Branch only on the result.
      const result = evaluateCertificateEligibility(facts);

      if (!result.eligible) {
        throw new BusinessRuleError("Certificado não elegível para geração", {
          blockingReasons: result.blockingReasons,
          warnings: result.warnings,
        });
      }

      // Eligible ⇒ the engine already required an ISSUED transcript with a policy.
      const transcript = facts.transcript;
      if (!transcript || !transcript.transcriptNumber || !transcript.transcriptChecksum) {
        // Data integrity: an issued transcript must carry a number + checksum.
        throw new ValidationError("Histórico emitido sem número/checksum", {
          transcriptVersionId: ["invalid"],
        });
      }

      const studentId = readString(transcript.studentSnapshot, "studentId");
      if (!studentId) {
        throw new ValidationError("Snapshot do histórico sem studentId", {
          transcriptVersionId: ["invalid"],
        });
      }

      // 4. Copy identity + snapshot facts verbatim (no recomputation).
      const status = result.requiresApproval
        ? CertificateStatus.PENDING_APPROVAL
        : CertificateStatus.DRAFT;

      const issueBasisSnapshot = {
        transcriptVersionId: transcript.transcriptVersionId,
        transcriptNumber: transcript.transcriptNumber,
        transcriptChecksum: transcript.transcriptChecksum,
        transcriptType: transcript.transcriptType,
        certificateType: input.certificateType,
        courseProgress: transcript.courseProgressSnapshot,
        eligibilityResult: {
          eligible: result.eligible,
          blockingReasons: result.blockingReasons,
          warnings: result.warnings,
          requiresApproval: result.requiresApproval,
          evaluatedPolicyId: result.evaluatedPolicyId,
          evaluatedAt: result.evaluatedAt,
        },
        policy: facts.policy,
        financialClearance: facts.financialClearance,
        administrative: facts.administrative,
      };

      const financialClearanceStatus =
        facts.financialClearance?.status ?? FinancialClearanceStatus.NOT_REQUIRED;

      // 5. Create the certificate (the only write). No number, no checksum, no
      //    verification row — this is generation, not issuance.
      const certificate = await createCertificate(
        {
          organizationId,
          studentId,
          enrollmentId: readString(transcript.courseSnapshot, "enrollmentId"),
          courseId: readString(transcript.courseSnapshot, "courseId"),
          transcriptVersionId: transcript.transcriptVersionId,
          transcriptNumber: transcript.transcriptNumber,
          transcriptChecksum: transcript.transcriptChecksum,
          certificatePolicyId: result.evaluatedPolicyId,
          certificateTemplateId: null,
          certificateNumber: null,
          certificateType: input.certificateType,
          status,
          studentSnapshot: JSON.stringify(transcript.studentSnapshot),
          courseSnapshot: transcript.courseSnapshot
            ? JSON.stringify(transcript.courseSnapshot)
            : null,
          issueBasisSnapshot: JSON.stringify(issueBasisSnapshot),
          financialClearanceStatus,
          financialClearanceCheckedAt: facts.financialClearance?.checkedAt ?? null,
          financialClearanceReference: facts.financialClearance?.reference ?? null,
          verificationCode: null,
          verificationUrl: null,
          expiresAt: null,
        },
        tx
      );

      return {
        certificateId: certificate.id,
        status: certificate.status,
        certificateType: certificate.certificateType,
        transcriptVersionId: certificate.transcriptVersionId,
        transcriptNumber: certificate.transcriptNumber,
        requiresApproval: result.requiresApproval,
        blockingReasons: result.blockingReasons,
        warnings: result.warnings,
      };
    });
  }
}
