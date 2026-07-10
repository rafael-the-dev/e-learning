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
import {
  ExamEventAggregateType,
  ExamEventType,
  ExamResultStatus,
  ExamSessionStatus,
} from "@/modules/examinations/constants";
import {
  approveExamResultSchema,
  bulkApproveExamResultsSchema,
  bulkReviewExamResultsSchema,
  returnExamResultForCorrectionSchema,
  reviewExamResultSchema,
  type ApproveExamResultInput,
  type BulkApproveExamResultsInput,
  type BulkReviewExamResultsInput,
  type ReturnExamResultForCorrectionInput,
  type ReviewExamResultInput,
} from "@/modules/examinations/schemas/result-review.schema";
import { findExamCandidateById } from "@/modules/examinations/repositories/exam-candidate.repository";
import { findExamSessionById } from "@/modules/examinations/repositories/exam-session.repository";
import { findAttendanceByCandidateId } from "@/modules/examinations/repositories/exam-attendance.repository";
import {
  findExamResultById,
  findResultsBySession,
  markExamResultApproved,
  markExamResultReviewed,
  returnExamResultToDraft,
} from "@/modules/examinations/repositories/exam-result.repository";
import { recordExamTransition } from "./scheduling-shared";
import { toResultItemError, type BulkResultItemOutcome } from "./result-entry-shared";
import {
  assertAttendanceStillAligns,
  assertResultInternallyConsistent,
  type ApproveExamResultResult,
  type ReturnForCorrectionResult,
  type ReviewExamResultResult,
} from "./result-review-shared";

// =============================================================================
// EXAMINATION ENGINE — EXAM RESULT REVIEW / APPROVAL COMMANDS (Phase 8)
// -----------------------------------------------------------------------------
// Records the OFFICIAL EXAM RESULT facts up to REVIEWED / APPROVED ONLY. This layer
// advances a SUBMITTED result through a two-eyes control (review → approval) and can
// return a not-yet-approved result to DRAFT for correction. It does NOT publish,
// calculate a final subject grade, decide pass/fail, touch StudentSubject/Level/
// Course progress, write a Transcript/Certificate, or run appeals / revisions (all
// later phases / out of scope). Every mutation follows the BaseCommand pattern
// (validate → authorize → execute in ONE db.$transaction) and writes ExamEvent +
// audit INSIDE the tx via `recordExamTransition` — there is NO domain-event bus /
// Outbox.
//
// • Review (perm exams.reviewResults): SUBMITTED → REVIEWED. Requires a marker, a
//   STRICT marker ≠ reviewer separation (SELF_REVIEW_NOT_ALLOWED), an open session,
//   an internally-consistent row, and attendance that STILL aligns (RESULT_STALE).
// • Approve (perm exams.approveResults): REVIEWED → APPROVED. Requires a reviewer and
//   a STRICT marker ≠ approver ≠ reviewer separation; attendance is RE-VALIDATED (it
//   could change between review and approval). Direct SUBMITTED → APPROVED is blocked.
// • Return-for-correction (perm exams.returnResultsForCorrection): SUBMITTED |
//   REVIEWED → DRAFT (reason REQUIRED). Content correction happens later via
//   UpdateDraftExamResultCommand — markerId / score / resultCode are NEVER written here.
// • Bulk review / approve: authorized ONCE up-front; a SELF-CONTAINED sequential
//   runner delegating the single command once per item, each in its OWN tx, with
//   session-membership enforcement. (No bulk return-for-correction.)
//
// Concurrency: every mark is a CONDITIONAL updateMany pinning the expected status,
// so a concurrently-moved row matches zero rows (RESULT_CONCURRENTLY_CHANGED). An
// APPROVED / PUBLISHED / INVALIDATED result is IMMUTABLE in Phase 8. NEVER mutates
// candidate / session status. TEACHER reviewer support is DEFERRED (admin-only).
// =============================================================================

const RESULT = ExamEventAggregateType.EXAM_RESULT;
const ENTITY = "ExamResult";
const CANDIDATE_ENTITY = "ExamCandidate";
const SESSION_ENTITY = "ExamSession";

/** Sessions in which a result may be reviewed / approved. Only COMPLETED occurs
 *  today; RESULTS_RECORDED is accepted for forward-compatibility. */
const REVIEW_OPEN_SESSION_STATUSES: string[] = [
  ExamSessionStatus.COMPLETED,
  ExamSessionStatus.RESULTS_RECORDED,
];

async function authorizeReview(userId: string, organizationId: string): Promise<void> {
  const perms = await getUserPermissions(userId, organizationId);
  if (!createAbility(perms).can(PERMISSIONS.EXAMS_REVIEW_RESULTS)) {
    throw new AuthorizationError();
  }
}

async function authorizeApprove(userId: string, organizationId: string): Promise<void> {
  const perms = await getUserPermissions(userId, organizationId);
  if (!createAbility(perms).can(PERMISSIONS.EXAMS_APPROVE_RESULTS)) {
    throw new AuthorizationError();
  }
}

async function authorizeReturn(userId: string, organizationId: string): Promise<void> {
  const perms = await getUserPermissions(userId, organizationId);
  if (!createAbility(perms).can(PERMISSIONS.EXAMS_RETURN_RESULTS_FOR_CORRECTION)) {
    throw new AuthorizationError();
  }
}

// ─── Review ────────────────────────────────────────────────────────────────────

export class ReviewExamResultCommand extends BaseCommand<
  ReviewExamResultInput,
  ReviewExamResultResult
> {
  async validate(): Promise<void> {
    const parsed = reviewExamResultSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    await authorizeReview(this.context.userId, this.context.organizationId);
  }

  async execute(): Promise<ReviewExamResultResult> {
    const { organizationId, userId } = this.context;
    const input = reviewExamResultSchema.parse(this.input);
    const db = await getDb();

    return db.$transaction(async (tx: PrismaClientOrTx) => {
      // 1. Result (org-scoped) — missing / cross-tenant is NotFound.
      const result = await findExamResultById({ organizationId, id: input.examResultId }, tx);
      if (!result) throw new NotFoundError(ENTITY, input.examResultId);

      // 2. Only a SUBMITTED result is reviewable.
      if (result.status !== ExamResultStatus.SUBMITTED) {
        throw new BusinessRuleError("RESULT_NOT_SUBMITTED", { resultStatus: result.status });
      }

      // 3. A marker must be recorded (the two-eyes control needs a first actor).
      if (!result.markerId) throw new BusinessRuleError("MARKER_REQUIRED");

      // 4. STRICT separation — the marker may never review their own result.
      if (result.markerId === userId) {
        throw new BusinessRuleError("SELF_REVIEW_NOT_ALLOWED");
      }

      // 5. Session-state gate (COMPLETED | RESULTS_RECORDED), resolved via candidate.
      const candidate = await findExamCandidateById(
        { organizationId, id: result.examCandidateId },
        tx
      );
      if (!candidate) throw new NotFoundError(CANDIDATE_ENTITY, result.examCandidateId);
      const session = await findExamSessionById(
        { organizationId, id: candidate.examSessionId },
        tx
      );
      if (!session) throw new NotFoundError(SESSION_ENTITY, candidate.examSessionId);
      if (!REVIEW_OPEN_SESSION_STATUSES.includes(session.status)) {
        throw new BusinessRuleError("SESSION_NOT_OPEN_FOR_RESULTS", {
          sessionStatus: session.status,
        });
      }

      // 6. Internal-consistency check (no re-derivation — the row must already agree).
      assertResultInternallyConsistent(result);

      // 7. Attendance must still align — a correction after submit ⇒ RESULT_STALE.
      const attendance = await findAttendanceByCandidateId(
        { organizationId, examCandidateId: result.examCandidateId },
        tx
      );
      if (!attendance) throw new BusinessRuleError("ATTENDANCE_NOT_MARKED");
      assertAttendanceStillAligns(result, attendance);

      // 8. Conditional SUBMITTED → REVIEWED (stamps reviewedById / reviewedAt).
      const reviewedAt = new Date();
      const marked = await markExamResultReviewed(
        { organizationId, id: input.examResultId, reviewedById: userId, reviewedAt },
        tx
      );
      if (marked.count !== 1) {
        throw new BusinessRuleError("RESULT_CONCURRENTLY_CHANGED", {
          expectedStatus: ExamResultStatus.SUBMITTED,
        });
      }

      // 9. ExamEvent + audit inside the tx (no bus). NO candidate/session mutation.
      await recordExamTransition(this.context, tx, {
        aggregateType: RESULT,
        aggregateId: result.id,
        eventType: ExamEventType.EXAM_RESULT_REVIEWED,
        entity: ENTITY,
        previousStatus: ExamResultStatus.SUBMITTED,
        newStatus: ExamResultStatus.REVIEWED,
        reason: input.reason ?? null,
        extraOld: { reviewedById: null, reviewedAt: null },
        extraNew: {
          examResultId: result.id,
          candidateId: candidate.id,
          sessionId: session.id,
          attemptId: candidate.examAttemptId,
          studentId: result.studentId,
          markerId: result.markerId,
          reviewerId: userId,
          reviewedAt,
          remarks: input.remarks ?? null,
        },
      });

      return {
        examResultId: result.id,
        status: ExamResultStatus.REVIEWED,
        reviewedById: userId,
        reviewedAt,
      };
    });
  }
}

// ─── Approve ─────────────────────────────────────────────────────────────────

export class ApproveExamResultCommand extends BaseCommand<
  ApproveExamResultInput,
  ApproveExamResultResult
> {
  async validate(): Promise<void> {
    const parsed = approveExamResultSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    await authorizeApprove(this.context.userId, this.context.organizationId);
  }

  async execute(): Promise<ApproveExamResultResult> {
    const { organizationId, userId } = this.context;
    const input = approveExamResultSchema.parse(this.input);
    const db = await getDb();

    return db.$transaction(async (tx: PrismaClientOrTx) => {
      // 1. Result (org-scoped) — missing / cross-tenant is NotFound.
      const result = await findExamResultById({ organizationId, id: input.examResultId }, tx);
      if (!result) throw new NotFoundError(ENTITY, input.examResultId);

      // 2. Only a REVIEWED result is approvable (direct SUBMITTED → APPROVED blocked).
      if (result.status !== ExamResultStatus.REVIEWED) {
        throw new BusinessRuleError("RESULT_NOT_REVIEWED", { resultStatus: result.status });
      }

      // 3. A reviewer must be recorded.
      if (!result.reviewedById) throw new BusinessRuleError("REVIEWER_REQUIRED");

      // 4. STRICT separation — the approver may be neither the marker nor the reviewer.
      if (result.markerId === userId) throw new BusinessRuleError("APPROVER_IS_MARKER");
      if (result.reviewedById === userId) throw new BusinessRuleError("APPROVER_IS_REVIEWER");

      // 5. Session-state gate (COMPLETED | RESULTS_RECORDED), resolved via candidate.
      const candidate = await findExamCandidateById(
        { organizationId, id: result.examCandidateId },
        tx
      );
      if (!candidate) throw new NotFoundError(CANDIDATE_ENTITY, result.examCandidateId);
      const session = await findExamSessionById(
        { organizationId, id: candidate.examSessionId },
        tx
      );
      if (!session) throw new NotFoundError(SESSION_ENTITY, candidate.examSessionId);
      if (!REVIEW_OPEN_SESSION_STATUSES.includes(session.status)) {
        throw new BusinessRuleError("SESSION_NOT_OPEN_FOR_RESULTS", {
          sessionStatus: session.status,
        });
      }

      // 6. Internal-consistency check.
      assertResultInternallyConsistent(result);

      // 7. Attendance is RE-VALIDATED — it could change between review and approval.
      const attendance = await findAttendanceByCandidateId(
        { organizationId, examCandidateId: result.examCandidateId },
        tx
      );
      if (!attendance) throw new BusinessRuleError("ATTENDANCE_NOT_MARKED");
      assertAttendanceStillAligns(result, attendance);

      // 8. Conditional REVIEWED → APPROVED (stamps approvedById / approvedAt).
      const approvedAt = new Date();
      const marked = await markExamResultApproved(
        { organizationId, id: input.examResultId, approvedById: userId, approvedAt },
        tx
      );
      if (marked.count !== 1) {
        throw new BusinessRuleError("RESULT_CONCURRENTLY_CHANGED", {
          expectedStatus: ExamResultStatus.REVIEWED,
        });
      }

      // 9. ExamEvent + audit inside the tx (no bus). NO candidate/session mutation.
      await recordExamTransition(this.context, tx, {
        aggregateType: RESULT,
        aggregateId: result.id,
        eventType: ExamEventType.EXAM_RESULT_APPROVED,
        entity: ENTITY,
        previousStatus: ExamResultStatus.REVIEWED,
        newStatus: ExamResultStatus.APPROVED,
        reason: input.reason ?? null,
        extraOld: { approvedById: null, approvedAt: null },
        extraNew: {
          examResultId: result.id,
          candidateId: candidate.id,
          sessionId: session.id,
          attemptId: candidate.examAttemptId,
          studentId: result.studentId,
          markerId: result.markerId,
          reviewerId: result.reviewedById,
          approverId: userId,
          approvedAt,
        },
      });

      return {
        examResultId: result.id,
        status: ExamResultStatus.APPROVED,
        approvedById: userId,
        approvedAt,
      };
    });
  }
}

// ─── Return for correction ─────────────────────────────────────────────────────

export class ReturnExamResultForCorrectionCommand extends BaseCommand<
  ReturnExamResultForCorrectionInput,
  ReturnForCorrectionResult
> {
  async validate(): Promise<void> {
    const parsed = returnExamResultForCorrectionSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    await authorizeReturn(this.context.userId, this.context.organizationId);
  }

  async execute(): Promise<ReturnForCorrectionResult> {
    const { organizationId } = this.context;
    const input = returnExamResultForCorrectionSchema.parse(this.input);
    const db = await getDb();

    return db.$transaction(async (tx: PrismaClientOrTx) => {
      // 1. Result (org-scoped) — missing / cross-tenant is NotFound.
      const result = await findExamResultById({ organizationId, id: input.examResultId }, tx);
      if (!result) throw new NotFoundError(ENTITY, input.examResultId);

      // 2. Only a not-yet-approved result (SUBMITTED | REVIEWED) may return to DRAFT.
      //    No attendance / session / consistency check needed — returning to DRAFT is
      //    always safe; the content correction happens later via UpdateDraftExamResult.
      const RETURNABLE: string[] = [ExamResultStatus.SUBMITTED, ExamResultStatus.REVIEWED];
      if (!RETURNABLE.includes(result.status)) {
        throw new BusinessRuleError("RESULT_NOT_RETURNABLE", { resultStatus: result.status });
      }

      // 3. Conditional return to DRAFT from the OBSERVED status (pinned in `where`).
      //    Returning from REVIEWED clears the review stamps; markerId + score/resultCode
      //    are NEVER touched here.
      const observedStatus = result.status;
      const clearReviewMetadata = observedStatus === ExamResultStatus.REVIEWED;
      const returned = await returnExamResultToDraft(
        {
          organizationId,
          id: input.examResultId,
          expectedStatus: observedStatus,
          clearReviewMetadata,
        },
        tx
      );
      if (returned.count !== 1) {
        throw new BusinessRuleError("RESULT_CONCURRENTLY_CHANGED", {
          expectedStatus: observedStatus,
        });
      }

      // 4. ExamEvent + audit inside the tx (no bus). NO candidate/session mutation.
      const returnedAt = new Date();
      await recordExamTransition(this.context, tx, {
        aggregateType: RESULT,
        aggregateId: result.id,
        eventType: ExamEventType.EXAM_RESULT_RETURNED_FOR_CORRECTION,
        entity: ENTITY,
        previousStatus: observedStatus,
        newStatus: ExamResultStatus.DRAFT,
        reason: input.reason,
        extraOld: {
          status: observedStatus,
          reviewedById: result.reviewedById,
          reviewedAt: result.reviewedAt,
        },
        extraNew: {
          examResultId: result.id,
          candidateId: result.examCandidateId,
          studentId: result.studentId,
          markerId: result.markerId,
          returnedAt,
          clearedReviewMetadata: clearReviewMetadata,
        },
      });

      return {
        examResultId: result.id,
        status: ExamResultStatus.DRAFT,
        returnedAt,
        reason: input.reason,
      };
    });
  }
}

// ─── Bulk (self-contained sequential runners) ────────────────────────────────

/** Per-item outcome of a bulk-review / bulk-approve run (keyed by result). */
export interface BulkReviewResultItem extends BulkResultItemOutcome {
  examResultId: string;
}

/** DTO returned by `BulkReviewExamResultsCommand` / `BulkApproveExamResultsCommand`.
 *  Invariant: `total === succeeded + failed + skipped`. */
export interface BulkResultReviewSummary {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  items: BulkReviewResultItem[];
}

export class BulkReviewExamResultsCommand extends BaseCommand<
  BulkReviewExamResultsInput,
  BulkResultReviewSummary
> {
  async validate(): Promise<void> {
    const parsed = bulkReviewExamResultsSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    // Authorized ONCE up-front; each delegated command also re-checks (defence in depth).
    await authorizeReview(this.context.userId, this.context.organizationId);
  }

  async execute(): Promise<BulkResultReviewSummary> {
    const { organizationId } = this.context;
    const input = bulkReviewExamResultsSchema.parse(this.input);
    const items: BulkReviewResultItem[] = [];
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;
    let stop = false;

    // Session-membership set — every result MUST belong to the indicated session
    // (via its candidate). A result from another session (or a missing one) is
    // failed per-item as RESULT_NOT_IN_SESSION and never reaches the single command.
    const sessionResultIds = new Set(
      (await findResultsBySession({ organizationId, examSessionId: input.examSessionId })).map(
        (r) => r.id
      )
    );

    for (const item of input.items) {
      if (stop) {
        items.push({
          examResultId: item.examResultId,
          ok: false,
          code: "SKIPPED",
          message: "Ignorado após uma falha anterior (stopOnFailure).",
        });
        skipped += 1;
        continue;
      }

      if (!sessionResultIds.has(item.examResultId)) {
        items.push({
          examResultId: item.examResultId,
          ok: false,
          code: "RESULT_NOT_IN_SESSION",
          message: "O resultado não pertence à sessão indicada.",
        });
        failed += 1;
        if (input.stopOnFailure) stop = true;
        continue;
      }

      try {
        // Re-use the single command; it opens its OWN transaction (no shared tx).
        await new ReviewExamResultCommand(
          { examResultId: item.examResultId, remarks: item.remarks, reason: item.reason },
          this.context
        ).run();
        items.push({ examResultId: item.examResultId, ok: true });
        succeeded += 1;
      } catch (err) {
        const { code, message } = toResultItemError(err);
        items.push({ examResultId: item.examResultId, ok: false, code, message });
        failed += 1;
        if (input.stopOnFailure) stop = true;
      }
    }

    return { total: input.items.length, succeeded, failed, skipped, items };
  }
}

export class BulkApproveExamResultsCommand extends BaseCommand<
  BulkApproveExamResultsInput,
  BulkResultReviewSummary
> {
  async validate(): Promise<void> {
    const parsed = bulkApproveExamResultsSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    await authorizeApprove(this.context.userId, this.context.organizationId);
  }

  async execute(): Promise<BulkResultReviewSummary> {
    const { organizationId } = this.context;
    const input = bulkApproveExamResultsSchema.parse(this.input);
    const items: BulkReviewResultItem[] = [];
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;
    let stop = false;

    const sessionResultIds = new Set(
      (await findResultsBySession({ organizationId, examSessionId: input.examSessionId })).map(
        (r) => r.id
      )
    );

    for (const item of input.items) {
      if (stop) {
        items.push({
          examResultId: item.examResultId,
          ok: false,
          code: "SKIPPED",
          message: "Ignorado após uma falha anterior (stopOnFailure).",
        });
        skipped += 1;
        continue;
      }

      if (!sessionResultIds.has(item.examResultId)) {
        items.push({
          examResultId: item.examResultId,
          ok: false,
          code: "RESULT_NOT_IN_SESSION",
          message: "O resultado não pertence à sessão indicada.",
        });
        failed += 1;
        if (input.stopOnFailure) stop = true;
        continue;
      }

      try {
        await new ApproveExamResultCommand(
          { examResultId: item.examResultId, reason: item.reason },
          this.context
        ).run();
        items.push({ examResultId: item.examResultId, ok: true });
        succeeded += 1;
      } catch (err) {
        const { code, message } = toResultItemError(err);
        items.push({ examResultId: item.examResultId, ok: false, code, message });
        failed += 1;
        if (input.stopOnFailure) stop = true;
      }
    }

    return { total: input.items.length, succeeded, failed, skipped, items };
  }
}
