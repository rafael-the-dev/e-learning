import type { PrismaClientOrTx } from "@/server/db";
import { BusinessRuleError } from "@/shared/lib/command";
import { DomainEventType } from "@/server/events/event-types";
import {
  CertificateStatus,
  CertificateVerificationPublicStatus,
  StaleReason,
} from "@/modules/certificates/constants";
import {
  findCertificateById,
  markCertificateStale,
  setCertificateStaleMetadata,
} from "@/modules/certificates/repositories/certificate.repository";
import { updatePublicStatusByCertificateId } from "@/modules/certificates/repositories/certificate-verification.repository";
import { createCertificateEvent } from "@/modules/certificates/repositories/certificate-event.repository";
import type { CertificateRecord } from "@/modules/certificates/types/repository";

// =============================================================================
// CERTIFICATE STALENESS — SHARED CORE (Phase 9)
// -----------------------------------------------------------------------------
// The single decision + write path for marking a certificate STALE in reaction to
// a TRANSCRIPT lifecycle fact (superseded / revoked / marked_stale). Used by BOTH
// the transcript-event handler (system actor) and the manual reconcile command.
//
// Core rules (§2/§3, all read from the transcript EVENT — never the transcript
// tables; this module performs NO academic recalculation):
//   • REVOKED                → no-op (terminal).
//   • DRAFT / PENDING_APPROVAL → no-op (do not mutate pre-issue drafts yet).
//   • ISSUED                 → status STALE + stale metadata; publicStatus SUSPENDED.
//   • SUSPENDED              → keep SUSPENDED; record stale metadata; publicStatus
//                              stays SUSPENDED (never hide an active suspension).
//   • STALE                  → keep STALE; refresh stale metadata only if the reason
//                              changed (same reason ⇒ idempotent no-op).
//
// Idempotency (§10): the decision makes a repeated identical fact a no-op, so no
// duplicate CertificateEvent / AuditLog / DomainEvent is written. Race safety: the
// certificate is re-read INSIDE the transaction and every write is conditional, so a
// concurrent transition surfaces as `count !== 1` → abort (that certificate only).
//
// This module NEVER publishes the domain event — it returns the payload for the
// caller to publish AFTER the transaction commits.
// =============================================================================

/** Map a transcript lifecycle event type to its certificate stale reason (§4).
 *  Returns `null` for any other event type. */
export function mapTranscriptEventToStaleReason(eventType: string): string | null {
  switch (eventType) {
    case DomainEventType.TRANSCRIPT_SUPERSEDED:
      return StaleReason.TRANSCRIPT_SUPERSEDED;
    case DomainEventType.TRANSCRIPT_REVOKED:
      return StaleReason.TRANSCRIPT_REVOKED;
    case DomainEventType.TRANSCRIPT_MARKED_STALE:
      return StaleReason.TRANSCRIPT_MARKED_STALE;
    default:
      return null;
  }
}

/** The relevant certificate statuses a transcript-staleness reaction may touch.
 *  DRAFT/PENDING_APPROVAL (pre-issue) and REVOKED (terminal) are excluded up front. */
export const STALE_RELEVANT_STATUSES: readonly string[] = [
  CertificateStatus.ISSUED,
  CertificateStatus.SUSPENDED,
  CertificateStatus.STALE,
];

export type StalenessAction = "stale" | "metadata" | "skip";
export type StalenessSkipReason =
  | "REVOKED"
  | "PRE_ISSUE"
  | "ALREADY_STALE"
  | "ALREADY_MARKED"
  | "NOT_FOUND";

export interface StalenessDecision {
  action: StalenessAction;
  skipReason?: StalenessSkipReason;
  previousStatus: string;
  newStatus: string;
  /** The public verification projection to set when the state changes (else null). */
  publicStatus: string | null;
  staleReason: string;
}

/** Pure decision (no I/O): given a certificate and the incoming stale reason, decide
 *  whether/how it becomes stale. Used directly for the reconcile command's dry-run. */
export function decideCertificateStaleness(
  certificate: CertificateRecord,
  staleReason: string
): StalenessDecision {
  const status = certificate.status;
  const base = { previousStatus: status, staleReason };

  if (status === CertificateStatus.REVOKED) {
    return { action: "skip", skipReason: "REVOKED", newStatus: status, publicStatus: null, ...base };
  }
  if (status === CertificateStatus.DRAFT || status === CertificateStatus.PENDING_APPROVAL) {
    return { action: "skip", skipReason: "PRE_ISSUE", newStatus: status, publicStatus: null, ...base };
  }
  if (status === CertificateStatus.ISSUED) {
    return {
      action: "stale",
      newStatus: CertificateStatus.STALE,
      publicStatus: CertificateVerificationPublicStatus.SUSPENDED,
      ...base,
    };
  }

  // SUSPENDED or STALE: keep the status. Only (re)record the metadata when the reason
  // actually changes — an identical repeat is an idempotent no-op.
  if (certificate.staleReason === staleReason) {
    return {
      action: "skip",
      skipReason: status === CertificateStatus.STALE ? "ALREADY_STALE" : "ALREADY_MARKED",
      newStatus: status,
      publicStatus: null,
      ...base,
    };
  }
  return {
    action: "metadata",
    newStatus: status,
    publicStatus: CertificateVerificationPublicStatus.SUSPENDED,
    ...base,
  };
}

export interface StalenessActor {
  /** `null` for the system event handler; the user id for the reconcile command. */
  id: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface ApplyStalenessParams {
  certificateId: string;
  organizationId: string;
  staleReason: string;
  actor: StalenessActor;
  /** The transcript DomainEvent id that triggered this (null for a manual reconcile). */
  sourceEventId?: string | null;
  now?: Date;
}

export interface StalenessOutcome {
  certificateId: string;
  changed: boolean;
  action: StalenessAction;
  skipReason?: StalenessSkipReason;
  previousStatus: string;
  newStatus: string;
  publicStatus: string | null;
  staleReason: string;
  /** Present ONLY when `changed` — the `certificate.marked_stale` payload to publish
   *  post-commit. */
  domainEventPayload?: Record<string, unknown>;
}

/** Apply the staleness decision to ONE certificate inside an existing transaction.
 *  Re-reads the certificate in-tx for a fresh decision, performs the conditional
 *  writes (status/metadata + verification projection + append-only CertificateEvent +
 *  AuditLog), and returns the outcome. Writes NOTHING and returns `changed: false`
 *  for a no-op. Never publishes — the caller publishes the returned payload after
 *  commit. */
export async function applyCertificateStalenessInTx(
  tx: PrismaClientOrTx,
  params: ApplyStalenessParams
): Promise<StalenessOutcome> {
  const { certificateId, organizationId, staleReason, actor } = params;
  const now = params.now ?? new Date();

  const certificate = await findCertificateById({ id: certificateId, organizationId }, tx);
  if (!certificate) {
    return {
      certificateId,
      changed: false,
      action: "skip",
      skipReason: "NOT_FOUND",
      previousStatus: "",
      newStatus: "",
      publicStatus: null,
      staleReason,
    };
  }

  const decision = decideCertificateStaleness(certificate, staleReason);
  const outcomeBase = {
    certificateId: certificate.id,
    action: decision.action,
    previousStatus: decision.previousStatus,
    newStatus: decision.newStatus,
    publicStatus: decision.publicStatus,
    staleReason,
  };

  if (decision.action === "skip") {
    return { ...outcomeBase, changed: false, skipReason: decision.skipReason };
  }

  // 1. Certificate status / metadata (conditional; race-safe).
  const marked =
    decision.action === "stale"
      ? await markCertificateStale({ id: certificate.id, organizationId, staleReason, staleDetectedAt: now }, tx)
      : await setCertificateStaleMetadata({ id: certificate.id, organizationId, staleReason, staleDetectedAt: now }, tx);
  if (marked.count !== 1) {
    throw new BusinessRuleError("Certificate changed concurrently during staleness detection.");
  }

  // 2. Public verification projection → SUSPENDED (a stale certificate never reads VALID).
  const projected = await updatePublicStatusByCertificateId(
    {
      organizationId,
      certificateId: certificate.id,
      publicStatus: CertificateVerificationPublicStatus.SUSPENDED,
    },
    tx
  );
  if (projected.count !== 1) {
    throw new BusinessRuleError("Certificate verification projection could not be updated.");
  }

  // 3. Append-only CertificateEvent (`certificate.marked_stale`).
  await createCertificateEvent(
    {
      organizationId,
      certificateId: certificate.id,
      eventType: DomainEventType.CERTIFICATE_MARKED_STALE,
      previousStatus: decision.previousStatus,
      newStatus: decision.newStatus,
      actorId: actor.id,
      reason: staleReason,
      metadata: JSON.stringify({
        staleReason,
        transcriptVersionId: certificate.transcriptVersionId,
        transcriptNumber: certificate.transcriptNumber,
        verificationPublicStatus: CertificateVerificationPublicStatus.SUSPENDED,
        sourceEventId: params.sourceEventId ?? null,
      }),
    },
    tx
  );

  // 4. AuditLog — written directly (not via auditService) so a SYSTEM actor id can be
  //    null (the auditService always stamps the context user as the actor).
  await tx.auditLog.create({
    data: {
      organizationId,
      actorId: actor.id,
      entity: "Certificate",
      entityId: certificate.id,
      action: DomainEventType.CERTIFICATE_MARKED_STALE,
      oldValues: JSON.stringify({
        status: decision.previousStatus,
        staleReason: certificate.staleReason,
      }),
      newValues: JSON.stringify({
        status: decision.newStatus,
        staleReason,
        verificationPublicStatus: CertificateVerificationPublicStatus.SUSPENDED,
      }),
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
    },
  });

  const domainEventPayload: Record<string, unknown> = {
    organizationId,
    certificateId: certificate.id,
    certificateNumber: certificate.certificateNumber,
    certificateType: certificate.certificateType,
    transcriptVersionId: certificate.transcriptVersionId,
    transcriptNumber: certificate.transcriptNumber,
    staleReason,
    previousStatus: decision.previousStatus,
    newStatus: decision.newStatus,
    actorId: actor.id,
    sourceEventId: params.sourceEventId ?? null,
  };

  return { ...outcomeBase, changed: true, domainEventPayload };
}
