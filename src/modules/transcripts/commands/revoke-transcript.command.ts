import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import {
  AuthorizationError,
  BaseCommand,
  BusinessRuleError,
  NotFoundError,
  ValidationError,
} from "@/shared/lib/command";
import { createAbility, getUserPermissions } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { DomainAggregateType, DomainEventType } from "@/server/events/event-types";
import type { DomainEvent } from "@/server/events/domain-event";
import { eventPublisher } from "@/server/events/event-publisher";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  STALE_REASON_CURRENT_VERSION_REVOKED,
  TranscriptStatus,
} from "@/modules/transcripts/constants";
import {
  revokeTranscriptSchema,
  type RevokeTranscriptSchema,
} from "@/modules/transcripts/schemas/transcript.schema";
import {
  findTranscriptById,
  updateTranscriptMetadata,
} from "@/modules/transcripts/repositories/academic-transcript.repository";
import {
  countActiveVersions,
  findVersionById,
  markVersionRevoked,
} from "@/modules/transcripts/repositories/academic-transcript-version.repository";
import { createTranscriptEvent } from "@/modules/transcripts/repositories/academic-transcript-event.repository";
import type {
  TranscriptRootRecord,
  TranscriptVersionRecord,
} from "@/modules/transcripts/types";

// =============================================================================
// REVOKE TRANSCRIPT COMMAND (Phase 5)
// -----------------------------------------------------------------------------
// Revokes an ISSUED or SUPERSEDED version: status → REVOKED (+ revokedAt/By/
// reason). REVOKED is terminal. NEVER deletes any row and NEVER mutates snapshot
// child rows. If the revoked version was the root's current version, the root's
// currentVersionId is cleared and it is flagged for regeneration (D3): we do NOT
// auto-point at a previous version — currentVersionId stays null until a new
// version is officially issued. When the revoked version was the LAST non-revoked
// version, the root's own status also becomes REVOKED (D3: "all versions
// revoked"). Runs in ONE transaction (version metadata, root metadata, audit,
// transcript-event); the domain event publishes AFTER commit only.
// =============================================================================

export interface RevokeTranscriptResult {
  transcript: TranscriptRootRecord;
  version: TranscriptVersionRecord;
}

const REVOCABLE = new Set<string>([TranscriptStatus.ISSUED, TranscriptStatus.SUPERSEDED]);

export class RevokeTranscriptCommand extends BaseCommand<
  RevokeTranscriptSchema,
  RevokeTranscriptResult
> {
  async validate(): Promise<void> {
    const result = revokeTranscriptSchema.safeParse(this.input);
    if (!result.success) {
      throw new ValidationError("Dados inválidos", result.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.TRANSCRIPTS_REVOKE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<RevokeTranscriptResult> {
    const { organizationId, userId } = this.context;
    const { transcriptVersionId, reason } = revokeTranscriptSchema.parse(this.input);
    const now = new Date();
    const db = await getDb();
    const events: DomainEvent[] = [];

    const result = await db.$transaction(async (tx: PrismaClientOrTx) => {
      const version = await findVersionById({ id: transcriptVersionId, organizationId }, tx);
      if (!version) throw new NotFoundError("AcademicTranscriptVersion", transcriptVersionId);
      if (!REVOCABLE.has(version.status)) {
        throw new BusinessRuleError(
          `Only an ISSUED or SUPERSEDED version can be revoked (current status: ${version.status}).`
        );
      }

      const transcript = await findTranscriptById({ id: version.transcriptId, organizationId }, tx);
      if (!transcript) throw new NotFoundError("AcademicTranscript", version.transcriptId);

      const previousStatus = version.status;

      // ── Revoke the version (terminal). Snapshot rows are never touched. ──
      // Conditional write (WHERE status IN (ISSUED, SUPERSEDED)). A concurrent
      // double-revoke finds the row already REVOKED → count 0 → abort before any
      // duplicate event/audit is written.
      const revoked = await markVersionRevoked(
        { id: version.id, organizationId, revokedAt: now, revokedBy: userId, revokeReason: reason },
        tx
      );
      if (revoked.count !== 1) {
        throw new BusinessRuleError("Transcript version is no longer revocable.");
      }

      // ── Reconcile the root aggregate ──
      // Two independent effects, either of which may require a root write:
      //   (a) wasCurrent → clear the pointer + flag for regeneration (D3). We do
      //       NOT auto-point to a previous version.
      //   (b) allRevoked → the transcript no longer has any non-REVOKED version,
      //       so the root status becomes REVOKED (D3: "all versions revoked").
      // countActiveVersions runs AFTER markVersionRevoked, so the just-revoked
      // row is already excluded. A non-current revoke that is NOT the last active
      // version leaves currentVersionId / status / stale flags untouched.
      const wasCurrent = transcript.currentVersionId === version.id;
      const allRevoked =
        (await countActiveVersions({ transcriptId: transcript.id, organizationId }, tx)) === 0;

      if (wasCurrent || allRevoked) {
        const rootUpdate = await updateTranscriptMetadata(
          {
            id: transcript.id,
            organizationId,
            // (a) current-version effects — only when the revoked version was current.
            ...(wasCurrent
              ? {
                  currentVersionId: null,
                  needsRegeneration: true,
                  staleReason: STALE_REASON_CURRENT_VERSION_REVOKED,
                  staleDetectedAt: now,
                  // Guard so a concurrent issue that re-pointed the root loses
                  // the race → count 0 → abort.
                  expectCurrentVersionId: version.id,
                }
              : {}),
            // (b) fully-revoked aggregate → root status REVOKED.
            ...(allRevoked
              ? {
                  status: TranscriptStatus.REVOKED,
                  // Optimistic guard (M1): the status flip applies only if the
                  // root still holds the status we read in-tx, so a concurrent
                  // transition (e.g. a re-issue) loses the race → count 0 →
                  // abort. For a non-current last-active revoke, also pin the
                  // pointer we observed (expected null — the current version, if
                  // any, was revoked earlier) so a concurrent issue that
                  // re-pointed the root aborts us too.
                  expectStatus: transcript.status,
                  ...(wasCurrent ? {} : { expectCurrentVersionId: transcript.currentVersionId }),
                }
              : {}),
          },
          tx
        );
        if (rootUpdate.count !== 1) {
          throw new BusinessRuleError("Transcript root changed concurrently during revoke.");
        }
      }

      // ── Transcript-event + audit ──
      await createTranscriptEvent(
        {
          organizationId,
          transcriptId: transcript.id,
          transcriptVersionId: version.id,
          eventType: DomainEventType.TRANSCRIPT_REVOKED,
          previousStatus,
          newStatus: TranscriptStatus.REVOKED,
          reason,
          actorId: userId,
          metadata: JSON.stringify({ wasCurrent, rootRevoked: allRevoked }),
        },
        tx
      );
      await auditService.log(
        this.context,
        {
          entity: "AcademicTranscriptVersion",
          entityId: version.id,
          action: DomainEventType.TRANSCRIPT_REVOKED,
          oldValues: { status: previousStatus, currentVersionId: transcript.currentVersionId },
          newValues: {
            status: TranscriptStatus.REVOKED,
            revokedAt: now,
            revokedBy: userId,
            revokeReason: reason,
            ...(wasCurrent ? { currentVersionId: null, needsRegeneration: true } : {}),
            ...(allRevoked ? { rootStatus: TranscriptStatus.REVOKED } : {}),
          },
        },
        tx
      );
      events.push({
        organizationId,
        eventType: DomainEventType.TRANSCRIPT_REVOKED,
        aggregateType: DomainAggregateType.TRANSCRIPT,
        aggregateId: transcript.id,
        actorId: userId,
        payload: {
          organizationId,
          transcriptId: transcript.id,
          transcriptVersionId: version.id,
          studentId: transcript.studentId,
          enrollmentId: transcript.enrollmentId,
          courseId: transcript.courseId,
          transcriptType: transcript.transcriptType,
          transcriptNumber: transcript.transcriptNumber,
          previousStatus,
          newStatus: TranscriptStatus.REVOKED,
          actorId: userId,
          reason,
          revokedAt: now,
          checksum: version.checksum,
        },
      });

      const finalVersion = await findVersionById({ id: version.id, organizationId }, tx);
      const finalRoot = await findTranscriptById({ id: transcript.id, organizationId }, tx);
      return {
        transcript: finalRoot as TranscriptRootRecord,
        version: finalVersion as TranscriptVersionRecord,
      };
    });

    for (const event of events) await eventPublisher.publish(event);

    return result;
  }
}
