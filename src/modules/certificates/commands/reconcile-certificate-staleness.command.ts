import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import {
  AuthorizationError,
  BaseCommand,
  NotFoundError,
  ValidationError,
} from "@/shared/lib/command";
import { createAbility, getUserPermissions } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { DomainAggregateType, DomainEventType } from "@/server/events/event-types";
import type { DomainEvent } from "@/server/events/domain-event";
import { certificateOutbox } from "@/modules/certificates/outbox";
import { StaleReason } from "@/modules/certificates/constants";
import {
  reconcileCertificateStalenessSchema,
  type ReconcileCertificateStalenessInput,
} from "@/modules/certificates/schemas/certificate.schema";
import {
  findCertificateById,
  findCertificatesByTranscriptVersion,
} from "@/modules/certificates/repositories/certificate.repository";
import type { CertificateRecord } from "@/modules/certificates/types/repository";
import {
  applyCertificateStalenessInTx,
  decideCertificateStaleness,
  STALE_RELEVANT_STATUSES,
  type StalenessAction,
  type StalenessSkipReason,
} from "./certificate-staleness-shared";

// =============================================================================
// RECONCILE CERTIFICATE STALENESS COMMAND (Phase 9)
// -----------------------------------------------------------------------------
// Manual/admin backfill + reconciliation for the transcript-staleness reaction:
// marks the certificates linked to an invalidated transcript version STALE when the
// reactive event was missed (or to re-check a single certificate). It applies the
// SAME Phase 9 rules as the event handler (via the shared applier) and is idempotent.
//
// Targets (at least one required): `certificateId` (one) OR `transcriptVersionId`
// (all linked, live, ISSUED/SUSPENDED/STALE). `dryRun` (default TRUE) reports the
// planned changes WITHOUT writing. Apply mode uses ONE transaction PER certificate
// so a single failure does not roll the whole batch back — the result summarizes
// processed / changed / skipped / failed. Domain events publish AFTER commit.
//
// It reads NO transcript / Academic Core / grade / attendance table, recalculates
// nothing, regenerates/re-issues nothing, and does no PDF/export work. The caller
// supplies the stale `reason` (default `TRANSCRIPT_MARKED_STALE`).
// =============================================================================

export interface ReconcileStalenessItem {
  certificateId: string;
  action: StalenessAction;
  changed: boolean;
  previousStatus: string;
  newStatus: string;
  staleReason: string;
  skipReason?: StalenessSkipReason;
  error?: string;
}

export interface ReconcileCertificateStalenessResult {
  dryRun: boolean;
  processed: number;
  changed: number;
  skipped: number;
  failed: number;
  items: ReconcileStalenessItem[];
}

export class ReconcileCertificateStalenessCommand extends BaseCommand<
  ReconcileCertificateStalenessInput,
  ReconcileCertificateStalenessResult
> {
  async validate(): Promise<void> {
    const parsed = reconcileCertificateStalenessSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    // Staleness behaves like a public suspension → gated by `certificates.suspend`.
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.CERTIFICATES_SUSPEND)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<ReconcileCertificateStalenessResult> {
    const { organizationId, userId, ipAddress, userAgent } = this.context;
    const input = reconcileCertificateStalenessSchema.parse(this.input);
    const staleReason = input.reason ?? StaleReason.TRANSCRIPT_MARKED_STALE;
    const dryRun = input.dryRun;
    const db = await getDb();

    // ── Resolve targets (org-scoped) ──
    const targets: CertificateRecord[] = [];
    if (input.certificateId) {
      const cert = await findCertificateById({ id: input.certificateId, organizationId });
      // Cross-tenant / unknown certificate is indistinguishable from missing → 404.
      if (!cert) throw new NotFoundError("Certificate", input.certificateId);
      targets.push(cert);
    } else if (input.transcriptVersionId) {
      const certs = await findCertificatesByTranscriptVersion({
        organizationId,
        transcriptVersionId: input.transcriptVersionId,
        statuses: [...STALE_RELEVANT_STATUSES],
      });
      targets.push(...certs);
    }

    const items: ReconcileStalenessItem[] = [];
    const toPublish: DomainEvent[] = [];
    let changed = 0;
    let skipped = 0;
    let failed = 0;

    for (const cert of targets) {
      // ── Dry run: decide only, never write ──
      if (dryRun) {
        const decision = decideCertificateStaleness(cert, staleReason);
        const willChange = decision.action !== "skip";
        if (willChange) changed += 1;
        else skipped += 1;
        items.push({
          certificateId: cert.id,
          action: decision.action,
          changed: willChange,
          previousStatus: decision.previousStatus,
          newStatus: decision.newStatus,
          staleReason,
          skipReason: decision.skipReason,
        });
        continue;
      }

      // ── Apply: one transaction per certificate (partial failure isolated) ──
      try {
        const outcome = await db.$transaction((tx: PrismaClientOrTx) =>
          applyCertificateStalenessInTx(tx, {
            certificateId: cert.id,
            organizationId,
            staleReason,
            actor: { id: userId, ipAddress, userAgent },
            sourceEventId: null,
          })
        );
        if (outcome.changed) {
          changed += 1;
          if (outcome.domainEventPayload) {
            toPublish.push({
              organizationId,
              eventType: DomainEventType.CERTIFICATE_MARKED_STALE,
              aggregateType: DomainAggregateType.CERTIFICATE,
              aggregateId: cert.id,
              actorId: userId,
              payload: outcome.domainEventPayload,
            });
          }
        } else {
          skipped += 1;
        }
        items.push({
          certificateId: cert.id,
          action: outcome.action,
          changed: outcome.changed,
          previousStatus: outcome.previousStatus,
          newStatus: outcome.newStatus,
          staleReason,
          skipReason: outcome.skipReason,
        });
      } catch (err) {
        failed += 1;
        items.push({
          certificateId: cert.id,
          action: "skip",
          changed: false,
          previousStatus: cert.status,
          newStatus: cert.status,
          staleReason,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Publish domain events only after all per-certificate transactions committed —
    // via the Outbox (enqueue → publish), recorded and replayable (Phase 14).
    await certificateOutbox.dispatch(toPublish);

    return { dryRun, processed: targets.length, changed, skipped, failed, items };
  }
}
