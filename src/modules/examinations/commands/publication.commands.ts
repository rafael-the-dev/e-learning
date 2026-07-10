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
import type { ExamPublicationRecord } from "@/modules/examinations/types/repository";
import {
  ExamEventAggregateType,
  ExamEventType,
  ExamPublicationStatus,
  ExamSessionStatus,
} from "@/modules/examinations/constants";
import {
  publishExamSessionResultsSchema,
  retractExamSessionPublicationSchema,
  type PublishExamSessionResultsInput,
  type RetractExamSessionPublicationInput,
} from "@/modules/examinations/schemas/publication.schema";
import {
  findExamSessionById,
  markExamSessionPublished,
  markExamSessionResultsRecorded,
  returnExamSessionToResultsRecorded,
} from "@/modules/examinations/repositories/exam-session.repository";
import { listRegisteredCandidatesBySession } from "@/modules/examinations/repositories/exam-candidate.repository";
import { listAttendanceBySession } from "@/modules/examinations/repositories/exam-attendance.repository";
import {
  findResultsBySession,
  markExamResultsPublishedConditionally,
  returnExamResultsToApprovedConditionally,
} from "@/modules/examinations/repositories/exam-result.repository";
import {
  createExamPublication,
  findActivePublicationBySession,
  findExamPublicationById,
  markExamPublicationRetracted,
} from "@/modules/examinations/repositories/exam-publication.repository";
import { recordExamTransition } from "./scheduling-shared";
import {
  evaluatePublicationReadiness,
  type PublishExamSessionResultsResult,
  type RetractExamSessionPublicationResult,
} from "./publication-shared";

// =============================================================================
// EXAMINATION ENGINE — EXAM RESULT PUBLICATION COMMANDS (Phase 9)
// -----------------------------------------------------------------------------
// Session-level result PUBLICATION is the VISIBILITY BOUNDARY (D9): before a session
// is published its official results are internal-only; publishing makes the whole
// session's results visible AT ONCE. This layer advances APPROVED results to
// PUBLISHED and moves the session COMPLETED → RESULTS_RECORDED → PUBLISHED, all in
// ONE db.$transaction, plus a matching ExamPublication row. It does NOT calculate a
// final subject grade, decide pass/fail, touch StudentSubject/Level/Course progress,
// write a Transcript/Certificate, or run appeals / revisions (all later phases / out
// of scope). Every mutation follows the BaseCommand pattern (validate → authorize →
// execute in ONE tx) and writes ExamEvent + audit INSIDE the tx via
// `recordExamTransition` — there is NO domain-event bus / Outbox (Phase 14).
//
// • Publish (perm exams.publishResults): re-validates the WHOLE session — every
//   active (REGISTERED) candidate must have a result; every result must be APPROVED;
//   none may be stale against the current attendance (RESULT_STALE) — then atomically
//   flips APPROVED → PUBLISHED for every result, advances the session, and creates the
//   PUBLISHED ExamPublication. Single-active-publication is enforced by a LOOKUP (no
//   filtered-unique index): the read-check race window is closed by the conditional
//   session/result writes (a lost race ⇒ count mismatch ⇒ RESULT_CONCURRENTLY_CHANGED).
// • Retract (perm exams.retractPublication): the PRE-INTEGRATION v1 escape hatch —
//   publication PUBLISHED → RETRACTED, results PUBLISHED → APPROVED, session PUBLISHED
//   → RESULTS_RECORDED, reason REQUIRED, NO deletes. It MUST be revisited once Phase 11
//   Grade / Progression integration exists (downstream reconciliation / staleness).
//
// Post-publication CONTENT is immutable here: score / maxScore / normalizedScore /
// resultCode / markerId / reviewedById / approvedById / remarks are NEVER mutated by
// publish OR retract — only the lifecycle status + publish/retract stamps move.
// =============================================================================

const SESSION = ExamEventAggregateType.EXAM_SESSION;
const PUBLICATION = ExamEventAggregateType.EXAM_PUBLICATION;
const SESSION_ENTITY = "ExamSession";
const PUBLICATION_ENTITY = "ExamPublication";

/** Session states from which a publish may be opened. A COMPLETED session is first
 *  advanced to RESULTS_RECORDED; a RESULTS_RECORDED session is published directly. */
const PUBLISH_OPEN_SESSION_STATUSES: string[] = [
  ExamSessionStatus.COMPLETED,
  ExamSessionStatus.RESULTS_RECORDED,
];

async function authorizePublish(userId: string, organizationId: string): Promise<void> {
  const perms = await getUserPermissions(userId, organizationId);
  if (!createAbility(perms).can(PERMISSIONS.EXAMS_PUBLISH_RESULTS)) {
    throw new AuthorizationError();
  }
}

async function authorizeRetract(userId: string, organizationId: string): Promise<void> {
  const perms = await getUserPermissions(userId, organizationId);
  if (!createAbility(perms).can(PERMISSIONS.EXAMS_RETRACT_PUBLICATION)) {
    throw new AuthorizationError();
  }
}

// ─── Publish ─────────────────────────────────────────────────────────────────

export class PublishExamSessionResultsCommand extends BaseCommand<
  PublishExamSessionResultsInput,
  PublishExamSessionResultsResult
> {
  async validate(): Promise<void> {
    const parsed = publishExamSessionResultsSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    await authorizePublish(this.context.userId, this.context.organizationId);
  }

  async execute(): Promise<PublishExamSessionResultsResult> {
    const { organizationId, userId } = this.context;
    const input = publishExamSessionResultsSchema.parse(this.input);
    const db = await getDb();

    return db.$transaction(async (tx: PrismaClientOrTx) => {
      // 1. Session (org-scoped) — missing / cross-tenant is NotFound.
      const session = await findExamSessionById({ organizationId, id: input.examSessionId }, tx);
      if (!session) throw new NotFoundError(SESSION_ENTITY, input.examSessionId);

      // 2. Only a COMPLETED | RESULTS_RECORDED session may open a publication.
      if (!PUBLISH_OPEN_SESSION_STATUSES.includes(session.status)) {
        throw new BusinessRuleError("SESSION_NOT_READY_FOR_PUBLICATION", {
          sessionStatus: session.status,
        });
      }

      // 3. Load the authoritative facts: the active (REGISTERED) roster, every
      //    result, the current attendance, and any already-active publication.
      const candidates = await listRegisteredCandidatesBySession(
        { organizationId, examSessionId: input.examSessionId },
        tx
      );
      const results = await findResultsBySession(
        { organizationId, examSessionId: input.examSessionId },
        tx
      );
      const attendance = await listAttendanceBySession(
        { organizationId, examSessionId: input.examSessionId },
        tx
      );
      const active = await findActivePublicationBySession(
        { organizationId, examSessionId: input.examSessionId },
        tx
      );

      // Current attendance status per candidate (last-wins).
      const attendanceByCandidate: Record<string, string> = {};
      for (const a of attendance) attendanceByCandidate[a.examCandidateId] = a.status;

      // 4. Pure readiness verdict — then raise the first applicable blocker IN ORDER.
      const v = evaluatePublicationReadiness({
        requiredCandidateIds: candidates.map((c) => c.id),
        results: results.map((r) => ({
          id: r.id,
          examCandidateId: r.examCandidateId,
          status: r.status,
          resultCode: r.resultCode,
        })),
        attendanceByCandidate,
        hasActivePublication: !!active,
      });

      if (v.hasActivePublication) {
        throw new BusinessRuleError("PUBLICATION_ALREADY_EXISTS", {
          publicationId: active?.id ?? null,
        });
      }
      if (v.hasNothingToPublish) {
        throw new BusinessRuleError("SESSION_NOT_READY_FOR_PUBLICATION", { reason: "no results" });
      }
      if (v.missingCandidateIds.length) {
        throw new BusinessRuleError("RESULTS_MISSING", {
          missingCandidateIds: v.missingCandidateIds,
        });
      }
      if (v.nonApprovedResultIds.length) {
        throw new BusinessRuleError("RESULTS_NOT_APPROVED", {
          nonApprovedResultIds: v.nonApprovedResultIds,
        });
      }
      if (v.staleResultIds.length) {
        throw new BusinessRuleError("RESULT_STALE", { staleResultIds: v.staleResultIds });
      }

      // 5. Advance a COMPLETED session to RESULTS_RECORDED (skip if already there).
      //    Track whether the transition happened so we can emit its event below.
      const previousSessionStatus = session.status;
      const didRecordResults = session.status === ExamSessionStatus.COMPLETED;
      if (didRecordResults) {
        const recorded = await markExamSessionResultsRecorded(
          { organizationId, id: input.examSessionId },
          tx
        );
        if (recorded.count !== 1) {
          throw new BusinessRuleError("RESULT_CONCURRENTLY_CHANGED", {
            expectedStatus: ExamSessionStatus.COMPLETED,
          });
        }
      }

      // 6. Conditional APPROVED → PUBLISHED for the whole publishable set.
      const publishedAt = new Date();
      const publishedResults = await markExamResultsPublishedConditionally(
        { organizationId, ids: v.publishableResultIds },
        tx
      );
      if (publishedResults.count !== v.publishableResultIds.length) {
        throw new BusinessRuleError("RESULT_CONCURRENTLY_CHANGED", {
          expectedCount: v.publishableResultIds.length,
          actualCount: publishedResults.count,
        });
      }

      // 7. Create the PUBLISHED ExamPublication (provenance stamped at creation).
      const publication = await createExamPublication(
        {
          organizationId,
          examSessionId: input.examSessionId,
          status: ExamPublicationStatus.PUBLISHED,
          publishedAt,
          publishedById: userId,
          reason: input.reason ?? null,
        },
        tx
      );

      // 8. Conditional RESULTS_RECORDED → PUBLISHED for the session.
      const publishedSession = await markExamSessionPublished(
        { organizationId, id: input.examSessionId, publishedById: userId },
        tx
      );
      if (publishedSession.count !== 1) {
        throw new BusinessRuleError("RESULT_CONCURRENTLY_CHANGED", {
          expectedStatus: ExamSessionStatus.RESULTS_RECORDED,
        });
      }

      const resultCount = v.publishableResultIds.length;

      // 9. ExamEvents + audit inside the tx (no bus). NO per-result event.
      //    (a) the COMPLETED → RESULTS_RECORDED transition, only if it happened.
      if (didRecordResults) {
        await recordExamTransition(this.context, tx, {
          aggregateType: SESSION,
          aggregateId: session.id,
          eventType: ExamEventType.EXAM_SESSION_RESULTS_RECORDED,
          entity: SESSION_ENTITY,
          previousStatus: ExamSessionStatus.COMPLETED,
          newStatus: ExamSessionStatus.RESULTS_RECORDED,
          reason: input.reason ?? null,
          extraNew: { sessionId: session.id, resultCount },
        });
      }

      //    (b) the publication itself (aggregate EXAM_PUBLICATION).
      await recordExamTransition(this.context, tx, {
        aggregateType: PUBLICATION,
        aggregateId: publication.id,
        eventType: ExamEventType.EXAM_PUBLICATION_PUBLISHED,
        entity: PUBLICATION_ENTITY,
        previousStatus: "",
        newStatus: ExamPublicationStatus.PUBLISHED,
        reason: input.reason ?? null,
        extraNew: {
          publicationId: publication.id,
          sessionId: session.id,
          resultCount,
          publishedResultIds: v.publishableResultIds,
          previousSessionStatus,
          newSessionStatus: ExamSessionStatus.PUBLISHED,
          publishedById: userId,
          reason: input.reason ?? null,
        },
      });

      //    (c) the RESULTS_RECORDED → PUBLISHED session transition.
      await recordExamTransition(this.context, tx, {
        aggregateType: SESSION,
        aggregateId: session.id,
        eventType: ExamEventType.EXAM_SESSION_PUBLISHED,
        entity: SESSION_ENTITY,
        previousStatus: ExamSessionStatus.RESULTS_RECORDED,
        newStatus: ExamSessionStatus.PUBLISHED,
        reason: input.reason ?? null,
        extraNew: { sessionId: session.id, publicationId: publication.id, resultCount, publishedById: userId },
      });

      return {
        publicationId: publication.id,
        examSessionId: input.examSessionId,
        status: ExamPublicationStatus.PUBLISHED,
        resultCount,
        publishedAt,
        publishedById: userId,
      };
    });
  }
}

// ─── Retract ─────────────────────────────────────────────────────────────────

export class RetractExamSessionPublicationCommand extends BaseCommand<
  RetractExamSessionPublicationInput,
  RetractExamSessionPublicationResult
> {
  async validate(): Promise<void> {
    const parsed = retractExamSessionPublicationSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    await authorizeRetract(this.context.userId, this.context.organizationId);
  }

  async execute(): Promise<RetractExamSessionPublicationResult> {
    const { organizationId, userId } = this.context;
    const input = retractExamSessionPublicationSchema.parse(this.input);
    const db = await getDb();

    return db.$transaction(async (tx: PrismaClientOrTx) => {
      // 1. Session (org-scoped) — missing / cross-tenant is NotFound.
      const session = await findExamSessionById({ organizationId, id: input.examSessionId }, tx);
      if (!session) throw new NotFoundError(SESSION_ENTITY, input.examSessionId);

      // 2. Resolve the publication — by id (must belong to this session) or the
      //    session's active one. A missing / mismatched target is NotFound.
      let publication: ExamPublicationRecord | null;
      if (input.publicationId) {
        publication = await findExamPublicationById(
          { organizationId, id: input.publicationId },
          tx
        );
        if (!publication || publication.examSessionId !== input.examSessionId) {
          throw new NotFoundError(PUBLICATION_ENTITY, input.publicationId);
        }
      } else {
        publication = await findActivePublicationBySession(
          { organizationId, examSessionId: input.examSessionId },
          tx
        );
        if (!publication) throw new NotFoundError(PUBLICATION_ENTITY, input.examSessionId);
      }
      if (publication.status !== ExamPublicationStatus.PUBLISHED) {
        throw new BusinessRuleError("PUBLICATION_NOT_PUBLISHED", {
          publicationStatus: publication.status,
        });
      }

      // 3. The session must itself still be PUBLISHED to retract.
      if (session.status !== ExamSessionStatus.PUBLISHED) {
        throw new BusinessRuleError("SESSION_NOT_PUBLISHED", { sessionStatus: session.status });
      }

      // 4. The published results to roll back (PUBLISHED → APPROVED).
      const results = await findResultsBySession(
        { organizationId, examSessionId: input.examSessionId },
        tx
      );
      const publishedIds = results
        .filter((r) => r.status === ExamPublicationStatus.PUBLISHED)
        .map((r) => r.id);

      // 5. Conditional PUBLISHED → RETRACTED for the publication.
      const retractedAt = new Date();
      const retracted = await markExamPublicationRetracted(
        {
          organizationId,
          id: publication.id,
          retractedById: userId,
          retractedAt,
          reason: input.reason,
        },
        tx
      );
      if (retracted.count !== 1) {
        throw new BusinessRuleError("PUBLICATION_CONCURRENTLY_CHANGED", {
          expectedStatus: ExamPublicationStatus.PUBLISHED,
        });
      }

      // 6. Conditional PUBLISHED → APPROVED for every published result.
      const revertedResults = await returnExamResultsToApprovedConditionally(
        { organizationId, ids: publishedIds },
        tx
      );
      if (revertedResults.count !== publishedIds.length) {
        throw new BusinessRuleError("RESULT_CONCURRENTLY_CHANGED", {
          expectedCount: publishedIds.length,
          actualCount: revertedResults.count,
        });
      }

      // 7. Conditional PUBLISHED → RESULTS_RECORDED for the session.
      const revertedSession = await returnExamSessionToResultsRecorded(
        { organizationId, id: input.examSessionId },
        tx
      );
      if (revertedSession.count !== 1) {
        throw new BusinessRuleError("RESULT_CONCURRENTLY_CHANGED", {
          expectedStatus: ExamSessionStatus.PUBLISHED,
        });
      }

      const resultCount = publishedIds.length;

      // 8. ExamEvents + audit inside the tx (no bus).
      await recordExamTransition(this.context, tx, {
        aggregateType: PUBLICATION,
        aggregateId: publication.id,
        eventType: ExamEventType.EXAM_PUBLICATION_RETRACTED,
        entity: PUBLICATION_ENTITY,
        previousStatus: ExamPublicationStatus.PUBLISHED,
        newStatus: ExamPublicationStatus.RETRACTED,
        reason: input.reason,
        extraNew: {
          publicationId: publication.id,
          sessionId: session.id,
          resultCount,
          retractedById: userId,
          reason: input.reason,
        },
      });

      await recordExamTransition(this.context, tx, {
        aggregateType: SESSION,
        aggregateId: session.id,
        eventType: ExamEventType.EXAM_SESSION_RESULTS_RECORDED,
        entity: SESSION_ENTITY,
        previousStatus: ExamSessionStatus.PUBLISHED,
        newStatus: ExamSessionStatus.RESULTS_RECORDED,
        reason: input.reason,
        extraNew: { sessionId: session.id, publicationId: publication.id, resultCount },
      });

      return {
        publicationId: publication.id,
        examSessionId: input.examSessionId,
        publicationStatus: ExamPublicationStatus.RETRACTED,
        sessionStatus: ExamSessionStatus.RESULTS_RECORDED,
        resultCount,
        retractedAt,
        retractedById: userId,
      };
    });
  }
}
