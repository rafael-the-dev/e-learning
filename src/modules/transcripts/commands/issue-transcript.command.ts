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
import { TranscriptStatus } from "@/modules/transcripts/constants";
import { allocateTranscriptNumber } from "@/modules/transcripts/lib/transcript-number";
import {
  issueTranscriptSchema,
  type IssueTranscriptSchema,
} from "@/modules/transcripts/schemas/transcript.schema";
import {
  findTranscriptById,
  updateTranscriptMetadata,
} from "@/modules/transcripts/repositories/academic-transcript.repository";
import {
  findCurrentIssuedVersion,
  findVersionById,
  markVersionIssued,
  markVersionSuperseded,
} from "@/modules/transcripts/repositories/academic-transcript-version.repository";
import { findLevelSnapshotsByVersionId } from "@/modules/transcripts/repositories/academic-transcript-snapshot.repository";
import { createTranscriptEvent } from "@/modules/transcripts/repositories/academic-transcript-event.repository";
import type {
  TranscriptRootRecord,
  TranscriptVersionRecord,
} from "@/modules/transcripts/types";

// =============================================================================
// ISSUE TRANSCRIPT COMMAND (Phase 5)
// -----------------------------------------------------------------------------
// Promotes a DRAFT version to the official ISSUED record:
//   DRAFT → ISSUED, superseding the prior current ISSUED version (ISSUED →
//   SUPERSEDED) if one exists, allocating the root transcript number on first
//   issue, and pointing the root at the new current version.
//
// It NEVER mutates snapshot child rows, recomputes the checksum, rebuilds the
// snapshot, creates snapshot rows, or touches Academic Core. Everything runs in
// ONE transaction (number allocation, supersession, issue, root metadata, audit,
// transcript-event rows); domain events publish only AFTER commit.
// =============================================================================

export interface IssueTranscriptResult {
  transcript: TranscriptRootRecord;
  version: TranscriptVersionRecord;
}

export class IssueTranscriptCommand extends BaseCommand<
  IssueTranscriptSchema,
  IssueTranscriptResult
> {
  async validate(): Promise<void> {
    const result = issueTranscriptSchema.safeParse(this.input);
    if (!result.success) {
      throw new ValidationError("Dados inválidos", result.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.TRANSCRIPTS_ISSUE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<IssueTranscriptResult> {
    const { organizationId, userId } = this.context;
    const { transcriptVersionId, reason } = issueTranscriptSchema.parse(this.input);
    const now = new Date();
    const db = await getDb();
    const events: DomainEvent[] = [];

    const result = await db.$transaction(async (tx: PrismaClientOrTx) => {
      // ── Load + validate (inside the tx so the transition is race-safe) ──
      const version = await findVersionById({ id: transcriptVersionId, organizationId }, tx);
      if (!version) throw new NotFoundError("AcademicTranscriptVersion", transcriptVersionId);
      if (version.status !== TranscriptStatus.DRAFT) {
        throw new BusinessRuleError(
          `Only a DRAFT version can be issued (current status: ${version.status}).`
        );
      }

      const transcript = await findTranscriptById({ id: version.transcriptId, organizationId }, tx);
      if (!transcript) throw new NotFoundError("AcademicTranscript", version.transcriptId);

      // Snapshot rows + checksum must exist before an official issue.
      const levels = await findLevelSnapshotsByVersionId(
        { organizationId, transcriptVersionId: version.id },
        tx
      );
      if (levels.length === 0) {
        throw new BusinessRuleError("Cannot issue a version that has no snapshot rows.");
      }
      if (!version.checksum) {
        throw new BusinessRuleError("Cannot issue a version without a checksum.");
      }

      // ── Supersede the prior current ISSUED version (if any) ──
      // The DB enforces one ISSUED version per transcript, so this must happen
      // before the new one is marked ISSUED.
      const previous = await findCurrentIssuedVersion(
        { transcriptId: transcript.id, organizationId },
        tx
      );
      if (previous && previous.id !== version.id) {
        // Conditional write (WHERE status = ISSUED). A concurrent supersede/
        // revoke of the prior current version loses the race → count 0 → abort.
        const superseded = await markVersionSuperseded(
          { id: previous.id, organizationId, supersededAt: now },
          tx
        );
        if (superseded.count !== 1) {
          throw new BusinessRuleError("Current transcript version could not be superseded.");
        }
        await createTranscriptEvent(
          {
            organizationId,
            transcriptId: transcript.id,
            transcriptVersionId: previous.id,
            eventType: DomainEventType.TRANSCRIPT_SUPERSEDED,
            previousStatus: TranscriptStatus.ISSUED,
            newStatus: TranscriptStatus.SUPERSEDED,
            reason: reason ?? null,
            actorId: userId,
            metadata: JSON.stringify({ supersededBy: version.id }),
          },
          tx
        );
        await auditService.log(
          this.context,
          {
            entity: "AcademicTranscriptVersion",
            entityId: previous.id,
            action: DomainEventType.TRANSCRIPT_SUPERSEDED,
            oldValues: { status: TranscriptStatus.ISSUED },
            newValues: { status: TranscriptStatus.SUPERSEDED, supersededAt: now },
          },
          tx
        );
        events.push({
          organizationId,
          eventType: DomainEventType.TRANSCRIPT_SUPERSEDED,
          aggregateType: DomainAggregateType.TRANSCRIPT,
          aggregateId: transcript.id,
          actorId: userId,
          payload: {
            organizationId,
            transcriptId: transcript.id,
            transcriptVersionId: previous.id,
            studentId: transcript.studentId,
            enrollmentId: transcript.enrollmentId,
            courseId: transcript.courseId,
            transcriptType: transcript.transcriptType,
            transcriptNumber: transcript.transcriptNumber,
            previousStatus: TranscriptStatus.ISSUED,
            newStatus: TranscriptStatus.SUPERSEDED,
            actorId: userId,
            reason: reason ?? null,
            supersededAt: now,
            checksum: previous.checksum,
          },
        });
      }

      // ── Allocate the transcript number on first issue only (never reassign) ──
      const alreadyNumbered = transcript.transcriptNumber != null;
      const transcriptNumber =
        transcript.transcriptNumber ??
        (await allocateTranscriptNumber(tx, {
          organizationId,
          year: now.getFullYear(),
        }));

      // ── Mark the DRAFT version ISSUED (checksum left UNCHANGED) ──
      // Conditional write (WHERE status = DRAFT). If a concurrent issue already
      // promoted this version, count is 0 → abort before any duplicate event/
      // audit/number is written.
      const issued = await markVersionIssued(
        { id: version.id, organizationId, issuedAt: now, issuedBy: userId },
        tx
      );
      if (issued.count !== 1) {
        throw new BusinessRuleError("Transcript version is no longer in DRAFT state.");
      }

      // ── Update root metadata: current version + clear stale flags ──
      // Guards (optimistic concurrency): the root must still point where we read
      // it (`expectCurrentVersionId`) and — when we just allocated a number — must
      // still be unnumbered (`expectTranscriptNumberNull`). A concurrent issue
      // that already assigned the number loses the race → count 0 → abort, so an
      // issued transcriptNumber can never be overwritten.
      const rootUpdate = await updateTranscriptMetadata(
        {
          id: transcript.id,
          organizationId,
          status: TranscriptStatus.ISSUED,
          currentVersionId: version.id,
          transcriptNumber,
          needsRegeneration: false,
          staleReason: null,
          staleDetectedAt: null,
          issuedAt: transcript.issuedAt ?? now,
          issuedBy: transcript.issuedBy ?? userId,
          expectCurrentVersionId: transcript.currentVersionId,
          ...(alreadyNumbered ? {} : { expectTranscriptNumberNull: true }),
        },
        tx
      );
      if (rootUpdate.count !== 1) {
        throw new BusinessRuleError(
          alreadyNumbered
            ? "Transcript root changed concurrently during issue."
            : "Transcript number was already assigned by another transaction."
        );
      }

      // ── Transcript-event + audit for the issue ──
      await createTranscriptEvent(
        {
          organizationId,
          transcriptId: transcript.id,
          transcriptVersionId: version.id,
          eventType: DomainEventType.TRANSCRIPT_ISSUED,
          previousStatus: TranscriptStatus.DRAFT,
          newStatus: TranscriptStatus.ISSUED,
          reason: reason ?? null,
          actorId: userId,
          metadata: JSON.stringify({ transcriptNumber, checksum: version.checksum }),
        },
        tx
      );
      await auditService.log(
        this.context,
        {
          entity: "AcademicTranscriptVersion",
          entityId: version.id,
          action: DomainEventType.TRANSCRIPT_ISSUED,
          oldValues: { status: TranscriptStatus.DRAFT },
          newValues: {
            status: TranscriptStatus.ISSUED,
            issuedAt: now,
            issuedBy: userId,
            transcriptNumber,
            checksum: version.checksum,
          },
        },
        tx
      );
      events.push({
        organizationId,
        eventType: DomainEventType.TRANSCRIPT_ISSUED,
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
          transcriptNumber,
          previousStatus: TranscriptStatus.DRAFT,
          newStatus: TranscriptStatus.ISSUED,
          actorId: userId,
          reason: reason ?? null,
          issuedAt: now,
          checksum: version.checksum,
        },
      });

      const finalVersion = await findVersionById({ id: version.id, organizationId }, tx);
      const finalRoot = await findTranscriptById({ id: transcript.id, organizationId }, tx);
      // Non-null: both were just read/updated within this transaction.
      return { transcript: finalRoot as TranscriptRootRecord, version: finalVersion as TranscriptVersionRecord };
    });

    // Publish domain events ONLY after the transaction commits.
    for (const event of events) await eventPublisher.publish(event);

    return result;
  }
}
