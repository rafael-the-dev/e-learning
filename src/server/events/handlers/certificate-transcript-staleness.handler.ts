import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import type { DomainEventHandler } from "../event-handlers";
import type { DomainEvent, PersistedDomainEvent } from "../domain-event";
import { DomainAggregateType, DomainEventType } from "../event-types";
import { eventPublisher } from "../event-publisher";
import { findCertificatesByTranscriptVersion } from "@/modules/certificates/repositories/certificate.repository";
import {
  applyCertificateStalenessInTx,
  mapTranscriptEventToStaleReason,
  STALE_RELEVANT_STATUSES,
} from "@/modules/certificates/commands/certificate-staleness-shared";

// =============================================================================
// CERTIFICATE ↔ TRANSCRIPT STALENESS HANDLER (Phase 9)
// -----------------------------------------------------------------------------
// Reacts to a TRANSCRIPT lifecycle fact — `transcript.superseded` /
// `transcript.revoked` / `transcript.marked_stale` — by marking the certificates
// that certified that transcript version STALE (see the shared applier for the
// per-certificate rules). It reads the transcript facts from the EVENT PAYLOAD ONLY
// — it never reads a Transcript / Academic Core / grade / attendance table and
// recalculates nothing. It never regenerates, re-issues, or exports a certificate.
//
// Idempotency: the shared applier makes a repeated identical fact a per-certificate
// no-op (no duplicate CertificateEvent / AuditLog / DomainEvent), and the dispatcher
// additionally skips a handler that already PROCESSED this event. One transaction PER
// certificate; the `certificate.marked_stale` domain events publish AFTER commit.
// =============================================================================

export class CertificateTranscriptStalenessHandler implements DomainEventHandler {
  readonly handlerName = "CertificateTranscriptStalenessHandler";

  canHandle(event: PersistedDomainEvent): boolean {
    return (
      event.eventType === DomainEventType.TRANSCRIPT_SUPERSEDED ||
      event.eventType === DomainEventType.TRANSCRIPT_REVOKED ||
      event.eventType === DomainEventType.TRANSCRIPT_MARKED_STALE
    );
  }

  async handle(event: PersistedDomainEvent): Promise<void> {
    const staleReason = mapTranscriptEventToStaleReason(event.eventType);
    if (!staleReason) return;

    const payload = event.payload as Record<string, unknown>;
    const { organizationId } = event;
    const transcriptVersionId = payload.transcriptVersionId as string | undefined;
    if (!transcriptVersionId) return;

    const db = await getDb();

    // Only the statuses a staleness reaction may touch — pre-issue drafts and REVOKED
    // rows are excluded up front (the applier would no-op them anyway).
    const certificates = await findCertificatesByTranscriptVersion(
      { organizationId, transcriptVersionId, statuses: [...STALE_RELEVANT_STATUSES] },
      db
    );
    if (certificates.length === 0) return;

    const toPublish: DomainEvent[] = [];

    for (const certificate of certificates) {
      const outcome = await db.$transaction((tx: PrismaClientOrTx) =>
        applyCertificateStalenessInTx(tx, {
          certificateId: certificate.id,
          organizationId,
          staleReason,
          // System actor: no user id (the reaction is machine-driven).
          actor: { id: null },
          sourceEventId: event.id,
        })
      );

      if (outcome.changed && outcome.domainEventPayload) {
        toPublish.push({
          organizationId,
          eventType: DomainEventType.CERTIFICATE_MARKED_STALE,
          aggregateType: DomainAggregateType.CERTIFICATE,
          aggregateId: certificate.id,
          payload: outcome.domainEventPayload,
        });
      }
    }

    // Publish only after every per-certificate transaction has committed.
    for (const evt of toPublish) await eventPublisher.publish(evt);
  }
}
